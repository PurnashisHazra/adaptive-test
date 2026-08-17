import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { formatDateTimeIST } from "../lib/istTime";
import { getMyStudentHistory } from "../api/client";
import type { StudentHistoryStats } from "../api/types";
import { AppPage } from "../components/AppPage";
import { PageEmpty, PageLoading } from "../components/AppPageStates";

function formatPercentile(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

export function StudentHistoryPage() {
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
      panel
      showSubNav
      title="My results"
      lead="All tests, papers, and challenges for your account. Percentage uses attempted questions only — skipped questions are not penalized."
      actions={
        <Link to="/take-test" className="btn btn-primary" style={{ textDecoration: "none" }}>
          Start test
        </Link>
      }
    >
      {loading ? (
        <PageLoading label="Loading your results…" />
      ) : data ? (
        <>
          <div className="app-stat-grid">
            <div className="card app-stat-card">
              <div className="label">Tests taken</div>
              <div className="app-stat-card__value">{data.tests_taken}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Average correct</div>
              <div className="app-stat-card__value">{data.average_score.toFixed(2)}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Best correct</div>
              <div className="app-stat-card__value">{data.best_score}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Best %</div>
              <div className="app-stat-card__value">{data.best_percentage}%</div>
            </div>
          </div>

          <section className="app-page-section student-content-section">
            <h2 className="app-page-section__title">All attempts</h2>
            <p className="app-page-section__lead">
              Every standalone test, paper, and challenge you have started — with correct, wrong, and not-attempted counts.
            </p>
            {data.recent_attempts.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Test name</th>
                      <th>Type</th>
                      <th>Attempt time</th>
                      <th>Correct</th>
                      <th>Wrong</th>
                      <th>Not attempted</th>
                      <th>Percentage</th>
                      <th>Percentile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_attempts.map((a) => (
                      <tr key={a.id}>
                        <td>{a.test_name}</td>
                        <td>
                          <span className="badge badge--muted">
                            {a.session_type === "paper"
                              ? "Paper"
                              : a.session_type === "challenge"
                                ? "Challenge"
                                : "Test"}
                          </span>
                        </td>
                        <td>{formatDateTimeIST(a.started_at)}</td>
                        <td>{a.correct ?? 0}</td>
                        <td>{a.wrong ?? 0}</td>
                        <td>{a.not_attempted ?? 0}</td>
                        <td>{a.percentage.toFixed(1)}%</td>
                        <td
                          title={
                            a.cohort_ranked_count && a.cohort_ranked_count > 0
                              ? `Among ${a.cohort_ranked_count} comparable attempt${a.cohort_ranked_count === 1 ? "" : "s"}`
                              : "Not enough cohort data yet"
                          }
                        >
                          {formatPercentile(a.cohort_percentile)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <PageEmpty
                title="No attempts yet"
                action={
                  <Link to="/take-test" className="btn btn-primary" style={{ textDecoration: "none" }}>
                    Start your first test
                  </Link>
                }
              >
                Complete a test, paper, or challenge to see scores and percentiles here.
              </PageEmpty>
            )}
          </section>
        </>
      ) : (
        <PageEmpty title="Could not load results">Try refreshing the page in a moment.</PageEmpty>
      )}
    </AppPage>
  );
}
