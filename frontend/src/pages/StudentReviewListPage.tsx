import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getMyOverallAnalytics, listMyAnalyticsSessions } from "../api/client";
import { StudentOverall3DSpider } from "../components/StudentOverall3DSpider";
import type { StudentOverallAnalytics, StudentSessionSummary } from "../api/types";

export function StudentReviewListPage() {
  const [items, setItems] = useState<StudentSessionSummary[]>([]);
  const [overall, setOverall] = useState<StudentOverallAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listMyAnalyticsSessions(), getMyOverallAnalytics()])
      .then(([sessions, overallData]) => {
        setItems(sessions);
        setOverall(overallData);
      })
      .catch(() => toast.error("Could not load sessions"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1>Paper review</h1>
      <p style={{ color: "var(--muted)", maxWidth: 560 }}>
        Open any session to see each question, your result, time on the question, peer accuracy and average time, how your speed ranks against others, and explanations when available.
      </p>
      <p style={{ marginTop: "0.5rem" }}>
        <Link to="/history">Back to my results summary</Link>
      </p>
      {overall ? <StudentOverall3DSpider data={overall} /> : null}

      {loading ? (
        <p style={{ marginTop: "1.5rem", color: "var(--muted)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <p style={{ margin: 0, color: "var(--muted)" }}>No tests or papers yet. Complete a session to review it here.</p>
        </div>
      ) : (
        <ul className="review-snapshot-grid" style={{ listStyle: "none", padding: 0, marginTop: "1.25rem" }}>
          {items.map((s) => (
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
    </div>
  );
}
