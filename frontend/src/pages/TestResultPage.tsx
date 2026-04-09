import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTestSession } from "../store/testSession";

export function TestResultPage() {
  const nav = useNavigate();
  const summary = useTestSession((s) => s.lastSummary);
  const paperSummary = useTestSession((s) => s.lastPaperSummary);
  const reset = useTestSession((s) => s.reset);

  if (!summary && !paperSummary) {
    return <Navigate to="/start" replace />;
  }

  if (paperSummary) {
    return (
      <div className="page" style={{ maxWidth: 640 }}>
        <div className="card" style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>{paperSummary.title}</h1>
          <p style={{ color: "var(--muted)" }}>{paperSummary.student_name}</p>
          <p style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--primary-dark)", margin: "1rem 0 0.5rem" }}>{paperSummary.percentage.toFixed(1)}%</p>
          <p style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
            Total marks: {paperSummary.total_marks.toFixed(2)} / {paperSummary.max_marks.toFixed(2)}
          </p>
          {paperSummary.ended_early ? (
            <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>Question paper ended before all sections were completed.</p>
          ) : null}
        </div>
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <h3 style={{ marginTop: 0 }}>Sections</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {paperSummary.sections.map((s, i) => (
              <div
                key={i}
                style={{
                  padding: "0.75rem",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{s.section_title}</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                    {s.correct} correct · {s.wrong} wrong · {s.total_questions} questions
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{s.marks.toFixed(2)} marks</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              reset();
              nav("/papers");
            }}
          >
            Back to papers
          </button>
          <Link to="/start" className="btn btn-ghost">
            Standalone test
          </Link>
        </div>
      </div>
    );
  }

  const endedEarly = Boolean(summary?.ended_early);

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="card" style={{ textAlign: "center" }}>
        {endedEarly ? (
          <>
            <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem", color: "var(--text)" }}>Thank you</h1>
            <p style={{ color: "var(--muted)", fontSize: "1.05rem", marginBottom: "1rem" }}>
              Your test has ended. We appreciate you taking the time.
            </p>
            {summary!.total_questions > 0 ? (
              <>
                <p style={{ color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", fontSize: "0.8rem", marginBottom: "0.35rem" }}>Your result</p>
                <p style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--primary-dark)", margin: "0 0 0.5rem" }}>{summary!.percentage.toFixed(1)}%</p>
                <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                  {summary!.score} / {summary!.total_questions} correct
                </p>
              </>
            ) : (
              <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>No answers were submitted for this attempt.</p>
            )}
          </>
        ) : (
          <>
            <p style={{ color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", fontSize: "0.8rem" }}>Session complete</p>
            <h1 style={{ fontSize: "2.5rem", color: "var(--primary-dark)" }}>{summary!.percentage.toFixed(1)}%</h1>
            <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
              {summary!.score} / {summary!.total_questions} correct
            </p>
          </>
        )}
        <p style={{ color: "var(--muted)" }}>{summary!.student_name}</p>
      </div>
      {summary!.answers.length > 0 ? (
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>Review</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {summary!.answers.map((a) => (
              <div
                key={a.question_id}
                style={{
                  padding: "0.75rem",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: a.is_correct ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
                }}
              >
                <div style={{ fontWeight: 600 }}>{a.is_correct ? "Correct" : "Needs practice"}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            reset();
            nav("/start");
          }}
        >
          New test
        </button>
        <Link to="/history" className="btn btn-ghost">
          View history
        </Link>
      </div>
    </div>
  );
}
