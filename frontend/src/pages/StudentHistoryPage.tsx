import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getMyStudentHistory } from "../api/client";
import type { StudentHistoryStats } from "../api/types";
import { useAuthStore } from "../store/authStore";

export function StudentHistoryPage() {
  const session = useAuthStore((s) => s.session);
  const [data, setData] = useState<StudentHistoryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMyStudentHistory()
      .then((res) => {
        if (alive) setData(res);
      })
      .catch(() => {
        if (alive) {
          toast.error("Could not load your results");
          setData(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="page">
      <h1>My results</h1>
      <p style={{ color: "var(--muted)" }}>
        Completed tests where the session used your account name (<strong>{session?.username ?? "—"}</strong>). Standalone tests
        started from “Start a test” must use the same name as your login to appear here.
      </p>
      <p style={{ marginTop: "0.5rem" }}>
        <Link to="/review">Question-by-question answer review</Link> (time spent, explanations, right/wrong)
      </p>

      {loading ? (
        <p style={{ marginTop: "1.5rem", color: "var(--muted)" }}>Loading…</p>
      ) : data ? (
        <div style={{ marginTop: "2rem" }}>
          <div className="grid-2" style={{ marginBottom: "1.25rem" }}>
            <div className="card">
              <div className="label">Tests taken</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{data.tests_taken}</div>
            </div>
            <div className="card">
              <div className="label">Average score</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{data.average_score.toFixed(2)}</div>
            </div>
            <div className="card">
              <div className="label">Best score</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{data.best_score}</div>
            </div>
            <div className="card">
              <div className="label">Best %</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{data.best_percentage}%</div>
            </div>
          </div>
          <h3>Recent attempts</h3>
          <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Score</th>
                  <th>%</th>
                  <th>Subject</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.started_at).toLocaleString()}</td>
                    <td>
                      {a.score}/{a.total_questions}
                    </td>
                    <td>{a.percentage}%</td>
                    <td>{a.subject || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.recent_attempts.length === 0 && <div className="empty">No completed attempts yet.</div>}
          </div>
        </div>
      ) : (
        <p style={{ marginTop: "1.5rem", color: "var(--muted)" }}>Could not load results.</p>
      )}
    </div>
  );
}
