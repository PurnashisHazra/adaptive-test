import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { AdaptiveTestPitch } from "../components/AdaptiveTestPitch";
import { ChallengesHomePage } from "./ChallengesHomePage";

function MarketingLanding() {
  return (
    <div className="page">
      <div className="content-inner">
        <AdaptiveTestPitch signedIn={false} />
      </div>
      <ChallengesHomePage hideAdaptivePitch />
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
