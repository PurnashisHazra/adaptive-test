import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { getMyLearningTrends, listMyAnalyticsSessions } from "../api/client";
import { AttemptDrilldownModal } from "../components/AttemptDrilldownModal";
import { StudentLearningTrendCharts } from "../components/StudentLearningTrendCharts";
import type { StudentLearningTrendsResponse, StudentSessionSummary } from "../api/types";

export function StudentReviewListPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<StudentSessionSummary[]>([]);
  const [trends, setTrends] = useState<StudentLearningTrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillAttemptId, setDrillAttemptId] = useState<string | null>(null);
  const filter = searchParams.get("type");

  const filteredItems = useMemo(() => {
    if (filter === "paper" || filter === "standalone") {
      return items.filter((s) => s.session_type === filter);
    }
    return items;
  }, [items, filter]);

  useEffect(() => {
    Promise.all([listMyAnalyticsSessions(), getMyLearningTrends()])
      .then(([sessions, trendsData]) => {
        setItems(sessions);
        setTrends(trendsData);
      })
      .catch(() => toast.error("Could not load sessions"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <AttemptDrilldownModal attemptId={drillAttemptId} open={drillAttemptId != null} onClose={() => setDrillAttemptId(null)} />
      <h1>Paper review</h1>
      <p style={{ color: "var(--muted)", maxWidth: 560 }}>
        Open any session to see each question, your result, time on the question, peer accuracy and average time, how your speed ranks against others, and explanations when available.
      </p>
      <p style={{ marginTop: "0.5rem" }}>
        <Link to="/history">Back to my results summary</Link>
      </p>
      {trends ? <StudentLearningTrendCharts data={trends} onAttemptPointClick={setDrillAttemptId} /> : null}

      <section className="review-sessions-section" aria-label="Tests and papers to review">
        {loading ? (
          <p style={{ marginTop: 0, color: "var(--muted)" }}>Loading…</p>
        ) : filteredItems.length === 0 ? (
          <div className="card" style={{ marginTop: 0 }}>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {filter === "paper"
                ? "No paper attempts yet. Complete a paper to review it here."
                : filter === "standalone"
                  ? "No standalone attempts yet. Complete a standalone test to review it here."
                  : "No tests or papers yet. Complete a session to review it here."}
            </p>
          </div>
        ) : (
          <ul className="review-snapshot-grid" style={{ listStyle: "none", padding: 0, marginTop: 0 }}>
            {filteredItems.map((s) => (
              <li key={`${s.session_type}-${s.id}`}>
                <Link
                  to={`/review/${s.session_type}/${encodeURIComponent(s.id)}`}
                  className="card"
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: "inherit",
                    margin: 0,
                    padding: "1rem 1rem",
                    transition: "box-shadow 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div>
                      <span className="badge" style={{ marginBottom: "0.35rem", display: "inline-block" }}>
                        {s.kind_label}
                      </span>
                      <h2 className="review-snapshot-title" style={{ fontSize: "1rem", margin: "0.2rem 0 0.25rem" }}>
                        {s.title}
                      </h2>
                      {s.subtitle ? (
                        <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--muted)" }}>{s.subtitle}</p>
                      ) : null}
                      <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
                        {new Date(s.started_at).toLocaleString()}
                        {s.completed_at ? ` → ${new Date(s.completed_at).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <span style={{ fontSize: "0.82rem", color: "var(--primary-dark)", fontWeight: 600 }}>View →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
