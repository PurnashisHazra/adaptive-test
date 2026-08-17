import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { formatDateTimeIST } from "../lib/istTime";
import { getMyLearningTrends, listMyAnalyticsSessions } from "../api/client";
import { AttemptDrilldownModal } from "../components/AttemptDrilldownModal";
import { AppPagination } from "../components/AppPagination";
import { StudentLearningTrendCharts } from "../components/StudentLearningTrendCharts";
import type { StudentLearningTrendsResponse, StudentSessionSummary, StudentSessionType } from "../api/types";
import { AppPage } from "../components/AppPage";
import { PageEmpty, PageLoading } from "../components/AppPageStates";

const SESSIONS_PAGE_SIZE = 15;

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
  const sessionTypeFilter = filter === "paper" || filter === "standalone" ? filter : undefined;

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

  const emptyMessage =
    filter === "paper"
      ? "No paper attempts yet. Complete a paper to review it here."
      : filter === "standalone"
        ? "No standalone attempts yet. Complete a standalone test to review it here."
        : "No tests or papers yet. Complete a session to review it here.";

  const typeTabs = (
    <div className="app-page-tabs app-page-tabs--segmented" role="tablist" aria-label="Session type">
      <NavLink
        to="/review"
        end
        className={({ isActive }) => `btn ${isActive ? "btn-primary" : "btn-ghost"}`}
        role="tab"
      >
        All sessions
      </NavLink>
      <NavLink
        to="/review?type=paper"
        className={({ isActive }) => `btn ${isActive ? "btn-primary" : "btn-ghost"}`}
        role="tab"
      >
        Papers
      </NavLink>
      <NavLink
        to="/review?type=standalone"
        className={({ isActive }) => `btn ${isActive ? "btn-primary" : "btn-ghost"}`}
        role="tab"
      >
        Standalone
      </NavLink>
    </div>
  );

  return (
    <AppPage
      panel
      showSubNav
      title="Analytics"
      lead="Open any session for question-by-question review — your answers, timing, peer comparisons, and explanations when available."
      filters={typeTabs}
    >
      <AttemptDrilldownModal attemptId={drillAttemptId} open={drillAttemptId != null} onClose={() => setDrillAttemptId(null)} />

      <section className="student-content-section" aria-label="Learning trends">
        <h2 className="app-page-section__title">Progress overview</h2>
        <p className="app-page-section__lead">Accuracy and time trends across your completed sessions.</p>
        {trendsLoading ? (
          <PageLoading label="Loading progress charts…" />
        ) : trends ? (
          <StudentLearningTrendCharts data={trends} onAttemptPointClick={setDrillAttemptId} />
        ) : null}
      </section>

      <section className="student-content-section review-sessions-section" aria-label="Tests and papers to review">
        <div className="review-sessions-section__head">
          <div>
            <h2 className="app-page-section__title" style={{ marginBottom: 0 }}>
              Sessions to review
            </h2>
            {!sessionsLoading && total > 0 ? (
              <p className="app-page-section__lead" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
                {total} session{total === 1 ? "" : "s"}
                {sessionTypeFilter ? ` · ${sessionTypeFilter === "paper" ? "papers only" : "standalone only"}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        {sessionsLoading ? (
          <PageLoading label="Loading sessions…" />
        ) : items.length === 0 ? (
          <PageEmpty title="Nothing to review yet">{emptyMessage}</PageEmpty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
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
                        <strong>{s.title}</strong>
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

            <AppPagination
              page={page}
              totalPages={totalPages}
              total={total}
              loading={sessionsLoading}
              onPageChange={loadSessions}
              label="Sessions pagination"
            />
          </>
        )}
      </section>
    </AppPage>
  );
}
