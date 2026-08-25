import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { getGuestId } from "../lib/guestSession";
import { useHasTestSessionHydrated, useTestSession } from "../store/testSession";

/** Allows signed-in students or guests with an active challenge session. */
export function ChallengeExamRoute({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const token = useAuthStore((s) => s.token);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const sessionReady = useHasTestSessionHydrated();
  const structuredKind = useTestSession((s) => s.structuredKind);
  const attemptId = useTestSession((s) => s.attemptId);
  const paperSummary = useTestSession((s) => s.lastPaperSummary);
  const lastSummary = useTestSession((s) => s.lastSummary);

  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  if (!isHydrated || !sessionReady) {
    return <div className="page">Loading…</div>;
  }

  if (role === "student") {
    return <>{children}</>;
  }

  const hasExamSession = Boolean(attemptId || paperSummary || lastSummary);
  if (hasExamSession && (token || getGuestId())) {
    return <>{children}</>;
  }

  if (getGuestId() && (structuredKind === "challenge" || hasExamSession)) {
    return <>{children}</>;
  }

  return <Navigate to="/auth" replace />;
}
