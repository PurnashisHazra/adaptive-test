import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { formatDateTimeIST } from "../lib/istTime";
import { getMyLearningTrends, listMyAnalyticsSessions } from "../api/client";
import { AttemptDrilldownModal } from "../components/AttemptDrilldownModal";
import { StudentLearningTrendCharts } from "../components/StudentLearningTrendCharts";
import type { StudentLearningTrendsResponse, StudentSessionSummary, StudentSessionType } from "../api/types";
import { AppPage } from "../components/AppPage";

const SESSIONS_PAGE_SIZE = 15;

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

function statusBadge(status: string) {
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StudentReviewListPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<StudentSessionSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [trends, setTrends] = useState<StudentLearningTrendsResponse | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [drillAttemptId, setDrillAttemptId] = useState<string | null>(null);
  const filter = searchParams.get("type") as StudentSessionType | null;
  const sessionTypeFilter =
    filter === "paper" || filter === "standalone" ? filter : undefined;

  const loadSessions = useCallback(
    (p: number) => {
      setSessionsLoading(true);
      listMyAnalyticsSessions({ page: p, pageSize: SESSIONS_PAGE_SIZE, sessionType: sessionTypeFilter })
        .then((res) => {
          setItems(res.items);
          setPage(res.page);
          setTotalPages(res.total_pages);
          setTotal(res.total);
        })
        .catch(() => toast.error("Could not load sessions"))
        .finally(() => setSessionsLoading(false));
    },
    [sessionTypeFilter],
  );

  useEffect(() => {
    loadSessions(1);
  }, [loadSessions]);

  useEffect(() => {
    let alive = true;
    setTrendsLoading(true);
    getMyLearningTrends()
      .then((data) => {
        if (alive) setTrends(data);
      })
      .catch(() => {
        if (alive) toast.error("Could not load learning trends");
      })
      .finally(() => {
        if (alive) setTrendsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const pageList = useMemo(() => buildPageList(page, totalPages), [page, totalPages]);

  const emptyMessage =
    filter === "paper"
      ? "No paper attempts yet. Complete a paper to review it here."
      : filter === "standalone"
        ? "No standalone attempts yet. Complete a standalone test to review it here."
        : "No tests or papers yet. Complete a session to review it here.";

  return (
    <AppPage
      title="Paper review"
      lead="Open any session to see each question, your result, time on the question, peer accuracy and average time, how your speed ranks against others, and explanations when available."
    >
      <AttemptDrilldownModal attemptId={drillAttemptId} open={drillAttemptId != null} onClose={() => setDrillAttemptId(null)} />
      <nav className="app-page-nav">
        <Link to="/history" className="app-page-nav__link">
          ← Back to my results summary
        </Link>
      </nav>

      <section className="review-progress-section" aria-label="Learning trends">
        {trendsLoading ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>Loading progress charts…</p>
        ) : trends ? (
          <StudentLearningTrendCharts data={trends} onAttemptPointClick={setDrillAttemptId} />
        ) : null}
      </section>

      <section className="review-sessions-section" aria-label="Tests and papers to review">
        <div className="review-sessions-section__head">
          <h2>Your papers & tests</h2>
          {!sessionsLoading && total > 0 ? (
            <span className="review-sessions-section__meta">
              {total} session{total === 1 ? "" : "s"}
              {sessionTypeFilter ? ` · ${sessionTypeFilter === "paper" ? "papers" : "standalone"}` : ""}
            </span>
          ) : null}
        </div>

        {sessionsLoading ? (
          <p style={{ marginTop: 0, color: "var(--muted)" }}>Loading sessions…</p>
        ) : items.length === 0 ? (
          <div className="card" style={{ marginTop: 0 }}>
            <p style={{ margin: 0, color: "var(--muted)" }}>{emptyMessage}</p>
          </div>
        ) : (
          <>
            <div className="review-sessions-table-wrap">
              <table className="review-sessions-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Status / score</th>
                    <th>Started</th>
                    <th>Finished</th>
                    <th aria-label="Open review" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={`${s.session_type}-${s.id}`}>
                      <td>
                        <span className="badge">{s.kind_label}</span>
                      </td>
                      <td>
                        <span className="review-sessions-table__title">{s.title}</span>
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{s.subtitle ?? statusBadge(s.status)}</td>
                      <td style={{ fontSize: "0.85rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatDateTimeIST(s.started_at)}
                      </td>
                      <td style={{ fontSize: "0.85rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {s.completed_at ? formatDateTimeIST(s.completed_at) : "—"}
                      </td>
                      <td>
                        <Link
                          to={`/review/${s.session_type}/${encodeURIComponent(s.id)}`}
                          className="btn btn-ghost"
                          style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <nav className="review-sessions-pagination" aria-label="Sessions pagination">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={page <= 1 || sessionsLoading}
                  onClick={() => loadSessions(page - 1)}
                >
                  Previous
                </button>
                {pageList.map((p, i) =>
                  p === "gap" ? (
                    <span key={`gap-${i}`} style={{ color: "var(--muted)", padding: "0 0.25rem" }}>
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`btn ${p === page ? "btn-primary" : "btn-ghost"}`}
                      style={{ minWidth: "2.25rem", padding: "0.35rem 0.5rem" }}
                      disabled={sessionsLoading}
                      onClick={() => loadSessions(p)}
                      aria-current={p === page ? "page" : undefined}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={page >= totalPages || sessionsLoading}
                  onClick={() => loadSessions(page + 1)}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        )}
      </section>
    </AppPage>
  );
}
