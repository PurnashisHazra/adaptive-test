import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ChallengeHeroCta } from "../components/ChallengeHeroCta";
import { ChallengeParticipants } from "../components/ChallengeParticipants";
import { CohortPercentileBanner } from "../components/CohortPercentileBanner";
import { listChallengeCatalog, resumeChallenge, startChallenge } from "../api/client";
import { parseUtcInstant } from "../lib/istTime";
import type { ChallengeCatalogItem, ChallengeStatus } from "../api/types";
import { getGuestId, getOrCreateGuestId } from "../lib/guestSession";
import { useAuthStore } from "../store/authStore";
import { useTestSession } from "../store/testSession";

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function statusLabel(status: ChallengeStatus): string {
  if (status === "upcoming") return "Starts in";
  if (status === "live") return "Ends in";
  return "Ended";
}

function liveStatus(item: ChallengeCatalogItem, nowMs: number): ChallengeStatus {
  const launch = parseUtcInstant(item.launch_at).getTime();
  const end = parseUtcInstant(item.end_at).getTime();
  if (nowMs < launch) return "upcoming";
  if (nowMs >= end) return "ended";
  return "live";
}

function countdownSeconds(item: ChallengeCatalogItem, nowMs: number): number | null {
  const launch = parseUtcInstant(item.launch_at).getTime();
  const end = parseUtcInstant(item.end_at).getTime();
  if (nowMs < launch) return Math.max(0, Math.floor((launch - nowMs) / 1000));
  if (nowMs < end) return Math.max(0, Math.floor((end - nowMs) / 1000));
  return null;
}

/** Page numbers to render, with "gap" for ellipsis. */
function buildPageList(current: number, total: number): Array<number | "gap"> {
  if (total <= 1) return total === 1 ? [1] : [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("gap");
    out.push(sorted[i]);
  }
  return out;
}

function ChallengeCatalogPagination({
  page,
  totalPages,
  total,
  loading,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  const pageList = useMemo(() => buildPageList(page, totalPages), [page, totalPages]);

  const navStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginTop: "1.5rem",
    paddingTop: "1rem",
    borderTop: "1px solid var(--border)",
  };

  const pageBtn = (active: boolean): CSSProperties => ({
    minWidth: 40,
    padding: "0.45rem 0.65rem",
    borderRadius: 8,
    border: active ? "2px solid var(--primary)" : "1px solid var(--border)",
    background: active ? "rgba(99, 102, 241, 0.12)" : "var(--surface)",
    color: active ? "var(--primary-dark)" : "inherit",
    fontWeight: active ? 700 : 500,
    fontVariantNumeric: "tabular-nums",
    cursor: loading ? "wait" : "pointer",
  });

  if (totalPages < 1) return null;

  return (
    <nav style={navStyle} aria-label="Challenge pages">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={loading || page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page (newer challenges)"
      >
        Previous
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap", justifyContent: "center" }}>
        {pageList.map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} style={{ padding: "0 0.25rem", color: "var(--muted)" }} aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              style={pageBtn(p === page)}
              disabled={loading}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={loading || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page (older challenges)"
      >
        Next
      </button>
      <p style={{ width: "100%", textAlign: "center", margin: "0.35rem 0 0", fontSize: "0.875rem", color: "var(--muted)" }}>
        Page <strong>{page}</strong> of <strong>{totalPages}</strong>
        {total > 0 ? (
          <>
            {" "}
            · {total} challenge{total === 1 ? "" : "s"} · newest first
          </>
        ) : null}
      </p>
    </nav>
  );
}

function ChallengeCard({
  item,
  nowMs,
  starting,
  onStart,
  onContinue,
  signedIn,
}: {
  item: ChallengeCatalogItem;
  nowMs: number;
  starting: string | null;
  onStart: (id: string) => void;
  onContinue: (id: string) => void;
  signedIn: boolean;
}) {
  const status = liveStatus(item, nowMs);
  const countdownSec = countdownSeconds(item, nowMs);

  const canStart =
    status === "live" && item.has_access && !item.has_started && !item.completed && (signedIn || item.open_to_all);
  const canContinue =
    status === "live" && item.has_access && Boolean(item.challenge_attempt_id) && (signedIn || item.open_to_all);

  return (
    <div className="card challenge-card" style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div className="challenge-card__row">
        <div className="challenge-card__body">
          <h3 style={{ margin: "0 0 0.35rem" }}>{item.title}</h3>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            <span className="badge">{item.level}</span>
            <span className="badge" style={{ background: item.is_adaptive ? "rgba(14,165,233,0.15)" : "rgba(100,116,139,0.15)" }}>
              {item.is_adaptive ? "Adaptive" : "Non-adaptive"}
            </span>
            <span className="badge">{status}</span>
            {item.open_to_all ? <span className="badge">Open to all</span> : null}
          </div>
          {item.description ? (
            <p className="challenge-card__desc">{item.description}</p>
          ) : null}
          <p className="challenge-card__meta">
            {item.section_count} section{item.section_count === 1 ? "" : "s"} · +{item.marks_per_correct} / −{item.marks_per_incorrect}
            {item.participants_count > 0 ? (
              <> · {item.participants_count} participants</>
            ) : null}
          </p>
          {item.completed ? (
            <div style={{ marginTop: "0.65rem" }}>
              <CohortPercentileBanner
                data={{
                  cohort_percentile:
                    status === "ended" && item.my_final_percentile != null
                      ? item.my_final_percentile
                      : item.my_percentile,
                  cohort_ranked_count: item.ranked_count,
                  percentile_is_final: status === "ended",
                }}
                label={status === "ended" ? "Final overall percentile" : "Live overall percentile"}
              />
            </div>
          ) : null}
          <ChallengeParticipants
            challengeId={item.challenge_id}
            preview={item.participants}
            totalCount={item.participants_count}
            previewLimit={item.participants_preview_limit ?? 8}
          />
        </div>
        {countdownSec != null ? (
          <div className="challenge-card__countdown">
            <div className="challenge-card__countdown-label">{statusLabel(status)}</div>
            <div className="challenge-card__countdown-value">{formatCountdown(countdownSec)}</div>
          </div>
        ) : status === "ended" ? (
          <span className="badge">Closed</span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {item.completed ? (
          <span className="badge">Completed</span>
        ) : canStart && !signedIn ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={starting === item.challenge_id}
            onClick={() => onStart(item.challenge_id)}
          >
            {starting === item.challenge_id ? "Starting…" : "Start"}
          </button>
        ) : !item.has_access && status === "live" ? (
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Not assigned to you</span>
        ) : (
          <>
            {canContinue ? (
              <button type="button" className="btn btn-primary" disabled={starting === item.challenge_id} onClick={() => onContinue(item.challenge_id)}>
                {starting === item.challenge_id ? "Opening…" : "Continue"}
              </button>
            ) : null}
            {canStart ? (
              <button type="button" className="btn btn-primary" disabled={starting === item.challenge_id} onClick={() => onStart(item.challenge_id)}>
                {starting === item.challenge_id ? "Starting…" : "Enter challenge"}
              </button>
            ) : null}
            {status === "upcoming" ? (
              <button type="button" className="btn btn-ghost" disabled>
                Not started yet
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function ChallengesHomePage() {
  const nav = useNavigate();
  const role = useAuthStore((s) => s.role);
  const session = useAuthStore((s) => s.session);
  const hydratePaperStart = useTestSession((s) => s.hydratePaperStart);
  const reset = useTestSession((s) => s.reset);

  const PAGE_SIZE = 3;
  const [items, setItems] = useState<ChallengeCatalogItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const signedIn = role === "student" && Boolean(session?.username);

  const featuredChallenge = useMemo(() => {
    for (const item of items) {
      const status = liveStatus(item, nowMs);
      if (status !== "live" || !item.open_to_all) continue;
      if (item.completed) continue;
      return item;
    }
    return null;
  }, [items, nowMs]);

  const load = useCallback((targetPage: number) => {
    setLoading(true);
    const guestId = signedIn ? undefined : getGuestId() ?? undefined;
    listChallengeCatalog(targetPage, PAGE_SIZE, guestId)
      .then((res) => {
        setItems(res.items);
        setPage(res.page);
        setTotalPages(res.total_pages);
        setTotal(res.total);
      })
      .catch(() => toast.error("Could not load challenges"))
      .finally(() => setLoading(false));
  }, [signedIn]);

  useEffect(() => {
    load(page);
  }, [page, load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function onStart(challengeId: string) {
    setStarting(challengeId);
    try {
      reset();
      let label: string;
      if (signedIn && session?.username) {
        label = session.username;
      } else {
        getOrCreateGuestId();
        label = "Guest";
      }
      const res = await startChallenge(challengeId);
      hydratePaperStart(res, label, "challenge");
      nav("/test");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not start challenge");
    } finally {
      setStarting(null);
    }
  }

  async function onContinue(challengeId: string) {
    if (!signedIn) getOrCreateGuestId();
    setStarting(challengeId);
    try {
      reset();
      const res = await resumeChallenge(challengeId);
      const label = signedIn && session?.username ? session.username : "Guest";
      hydratePaperStart(res, label, "challenge");
      nav("/test");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not resume challenge");
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="page app-page challenges-home">
      <div className="content-inner">
        <ChallengeHeroCta
          signedIn={signedIn}
          featured={featuredChallenge}
          starting={starting === featuredChallenge?.challenge_id}
          onStartFeatured={() => {
            if (featuredChallenge) void onStart(featuredChallenge.challenge_id);
          }}
        />

        <div id="challenges-list" className="challenges-home__list-head">
          <h2 className="challenges-home__list-title">All challenges</h2>
          <p className="challenges-home__list-lead text-measure">
            Timed contests announced weekly. Open challenges appear first.
          </p>
          {signedIn ? (
            <p className="challenges-home__list-link">
              <Link to="/performance">View your performance dashboard →</Link>
            </p>
          ) : null}
        </div>


        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading challenges…</p>
        ) : items.length === 0 ? (
          <p className="empty">No challenges published yet.</p>
        ) : (
          <>
            <div className="app-page-stack app-page-stack--lg">
              {items.map((c) => (
                <ChallengeCard
                  key={c.challenge_id}
                  item={c}
                  nowMs={nowMs}
                  starting={starting}
                  onStart={onStart}
                  onContinue={onContinue}
                  signedIn={signedIn}
                />
              ))}
            </div>
            <ChallengeCatalogPagination
              page={page}
              totalPages={Math.max(1, totalPages)}
              total={total}
              loading={loading}
              onPageChange={(p) => setPage(Math.max(1, Math.min(Math.max(1, totalPages), p)))}
            />
          </>
        )}
      </div>
    </div>
  );
}
