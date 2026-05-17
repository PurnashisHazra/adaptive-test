import { ReactNode, useEffect } from "react";
import { useAuthStore } from "../store/authStore";

/** Blocks student feature routes until an instructor admin code is linked (modal is shown in AppShell). */
export function RequireStudentOnboarded({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const needsAdminCode = useAuthStore((s) => s.needsAdminCode);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  if (!isHydrated) return <div className="page">Loading…</div>;
  if (role === "student" && needsAdminCode) {
    return <div className="page" aria-hidden="true" />;
  }
  return <>{children}</>;
}
