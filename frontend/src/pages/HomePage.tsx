import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { LandingPage } from "./LandingPage";
import { ChallengesHomePage } from "./ChallengesHomePage";

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

  if (role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (role === "student") {
    return <ChallengesHomePage />;
  }

  return (
    <>
      <LandingPage />
      <ChallengesHomePage hideAdaptivePitch />
    </>
  );
}
