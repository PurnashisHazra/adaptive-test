import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { getGuestId } from "../lib/guestSession";
import { useTestSession } from "../store/testSession";

/** Allows signed-in students or guests with an active challenge session. */
export function ChallengeExamRoute({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const structuredKind = useTestSession((s) => s.structuredKind);
  const attemptId = useTestSession((s) => s.attemptId);
  const paperSummary = useTestSession((s) => s.lastPaperSummary);

  if (!isHydrated && !getGuestId()) {
    return <div className="page">Loading…</div>;
  }

  if (role === "student") {
    return <>{children}</>;
  }

  if (getGuestId() && (structuredKind === "challenge" || attemptId || paperSummary)) {
    return <>{children}</>;
  }

  return <Navigate to="/auth" replace />;
}
