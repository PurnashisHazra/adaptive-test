import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { listChallengeCatalog, resumeChallenge, startChallenge } from "../api/client";
import { parseUtcInstant } from "../lib/istTime";
import type { ChallengeCatalogItem, ChallengeStatus } from "../api/types";
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

  const canStart = signedIn && status === "live" && item.has_access && !item.has_started && !item.completed;
  const canContinue = signedIn && status === "live" && item.has_access && Boolean(item.challenge_attempt_id);

  return (
    <div className="card" style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
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
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.95rem", lineHeight: 1.5 }}>{item.description}</p>
          ) : null}
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
            {item.section_count} section{item.section_count === 1 ? "" : "s"} · +{item.marks_per_correct} / −{item.marks_per_incorrect}
            {item.participants_count > 0 ? (
              <> · {item.participants_count} attempted</>
            ) : null}
          </p>
          {item.my_percentile != null && item.ranked_count > 0 ? (
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem", fontWeight: 600 }}>
              Your score: {item.my_percentile}th percentile among {item.ranked_count} student
              {item.ranked_count === 1 ? "" : "s"}
            </p>
          ) : null}
          {item.participants.length > 0 ? (
            <div style={{ marginTop: "0.65rem" }}>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Attempted by
              </p>
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.65 }}>
                {item.participants.map((p, i) => (
                  <span key={`${item.challenge_id}-${p.profile_slug}`}>
                    {i > 0 ? ", " : null}
                    <Link to={`/u/${encodeURIComponent(p.profile_slug)}`}>{p.display_name}</Link>
                    {!p.completed ? <span style={{ color: "var(--muted)" }}> (in progress)</span> : null}
                  </span>
                ))}
              </p>
            </div>
          ) : null}
        </div>
        {countdownSec != null ? (
          <div style={{ textAlign: "right", minWidth: 120 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {statusLabel(status)}
            </div>
            <div style={{ fontSize: "1.35rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatCountdown(countdownSec)}</div>
          </div>
        ) : status === "ended" ? (
          <span className="badge">Closed</span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {item.completed ? (
          <span className="badge">Completed</span>
        ) : !signedIn ? (
          <Link to="/auth" className="btn btn-primary">
            Sign in to enter
          </Link>
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

  const [items, setItems] = useState<ChallengeCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const signedIn = role === "student" && Boolean(session?.username);

  const load = useCallback(() => {
    listChallengeCatalog()
      .then(setItems)
      .catch(() => toast.error("Could not load challenges"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(() => {
    const order: Record<ChallengeStatus, number> = { live: 0, upcoming: 1, ended: 2 };
    return [...items].sort((a, b) => {
      const d = order[liveStatus(a, nowMs)] - order[liveStatus(b, nowMs)];
      if (d !== 0) return d;
      return parseUtcInstant(a.launch_at).getTime() - parseUtcInstant(b.launch_at).getTime();
    });
  }, [items, nowMs]);

  async function onStart(challengeId: string) {
    if (!session?.username) {
      toast.error("Sign in to enter a challenge");
      nav("/auth");
      return;
    }
    setStarting(challengeId);
    try {
      reset();
      const res = await startChallenge(challengeId);
      hydratePaperStart(res, session.username, "challenge");
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
    if (!session?.username) return;
    setStarting(challengeId);
    try {
      reset();
      const res = await resumeChallenge(challengeId);
      hydratePaperStart(res, session.username, "challenge");
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
    <div className="page">
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ margin: "0 0 0.5rem" }}>Challenges</h1>
          <p style={{ margin: 0, color: "var(--muted)", maxWidth: 560 }}>
            Timed contests with scheduled launch and end windows — similar to coding platforms, built for adaptive tests.
          </p>
          {signedIn ? (
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.9rem" }}>
              <Link to="/performance">View your performance dashboard →</Link>
            </p>
          ) : null}
        </div>
        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading challenges…</p>
        ) : sorted.length === 0 ? (
          <p className="empty">No challenges published yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {sorted.map((c) => (
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
        )}
      </div>
    </div>
  );
}
