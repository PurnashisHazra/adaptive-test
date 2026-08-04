import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { formatDateTimeIST } from "../lib/istTime";
import { getMyStudentHistory } from "../api/client";
import type { StudentHistoryStats } from "../api/types";
import { AppPage } from "../components/AppPage";
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
    <AppPage
      title="My results"
      lead={
        <>
          Completed tests where the session used your account name (<strong>{session?.username ?? "—"}</strong>). Standalone tests
          started from “Start a test” must use the same name as your login to appear here.
        </>
      }
    >
      <nav className="app-page-nav">
        <Link to="/review" className="app-page-nav__link">
          Question-by-question answer review
        </Link>
        <Link to="/review?type=paper" className="app-page-nav__link">
          Paper-wise summary
        </Link>
      </nav>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : data ? (
        <>
          <div className="app-stat-grid">
            <div className="card app-stat-card">
              <div className="label">Tests taken</div>
              <div className="app-stat-card__value">{data.tests_taken}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Average score</div>
              <div className="app-stat-card__value">{data.average_score.toFixed(2)}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Best score</div>
              <div className="app-stat-card__value">{data.best_score}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Best %</div>
              <div className="app-stat-card__value">{data.best_percentage}%</div>
            </div>
          </div>
          <section className="app-page-section">
            <h2 className="app-page-section__title">All attempts</h2>
            <div className="table-wrap">
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
                      <td>{formatDateTimeIST(a.started_at)}</td>
                      <td>
                        {a.score}/{a.total_questions}
                      </td>
                      <td>{a.percentage}%</td>
                      <td>{a.subject ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <p className="empty">No results yet.</p>
      )}
    </AppPage>
  );
}
