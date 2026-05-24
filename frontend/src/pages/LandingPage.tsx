import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="page">
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center", paddingTop: "2rem" }}>
        <p style={{ color: "var(--muted)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.8rem" }}>
          Adaptive assessment
        </p>
        <h1 style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", lineHeight: 1.15, marginBottom: "1rem" }}>
          Measure mastery with questions that adapt to every learner
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "1.1rem", marginBottom: "2rem" }}>
          Each test begins at an accessible level and adjusts difficulty based on performance — without showing labels during the exam.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/auth" className="btn btn-primary">
            Sign in
          </Link>
          <Link to="/start" className="btn btn-secondary">
            Start a test
          </Link>
        </div>
      </div>
      <div style={{ marginTop: "3rem", display: "flex", justifyContent: "center" }}>
        <div className="card" style={{ maxWidth: 520, textAlign: "center" }}>
          <h3>For students</h3>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Enter your name, optionally narrow by subject, and complete a focused session with immediate feedback between steps.
          </p>
        </div>
      </div>
    </div>
  );
}
