import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { ChallengesHomePage } from "./ChallengesHomePage";

function MarketingLanding() {
  return (
    <div className="page">
      <ChallengesHomePage />
      <div style={{ maxWidth: 880, margin: "2rem auto 0", textAlign: "center" }}>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/take-test" className="btn btn-ghost">
            Practice test
          </Link>
          <Link to="/auth" className="btn btn-primary">
            Sign in
          </Link>
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
    return <ChallengesHomePage />;
  }

  return <MarketingLanding />;
}
