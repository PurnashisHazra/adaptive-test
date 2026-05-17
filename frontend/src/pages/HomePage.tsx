import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { StudentDashboardPage } from "./StudentDashboardPage";

function MarketingLanding() {
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
          <Link to="/take-test" className="btn btn-primary">
            Start a test
          </Link>
          <Link to="/auth" className="btn btn-ghost">
            Sign in
          </Link>
        </div>
      </div>
      <div style={{ marginTop: "3rem", display: "flex", justifyContent: "center" }}>
        <div className="card" style={{ maxWidth: 520, textAlign: "center" }}>
          <h3>For students</h3>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Sign in to see your learning curves, performance radar, and personalised strategy. Guests can start a practice session from the button above.
          </p>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const role = useAuthStore((s) => s.role);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  if (!isHydrated) {
    return (
      <div className="page">
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  if (role === "super_admin") {
    return <Navigate to="/super-admin" replace />;
  }

  if (role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (role === "student") {
    return <StudentDashboardPage />;
  }

  return <MarketingLanding />;
}
