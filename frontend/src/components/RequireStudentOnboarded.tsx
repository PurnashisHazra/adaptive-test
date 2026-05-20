import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/** Blocks instructor-gated routes until an admin code is linked (optional at signup). */
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
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem" }}>Instructor code required</h2>
          <p style={{ color: "var(--muted)", margin: "0 0 1rem" }}>
            Practice tests and assigned papers need an instructor admin code. You can add one in your profile.
            Challenges, Analytics, and Performance work without a code.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link to="/profile" className="btn btn-primary">
              Go to Profile
            </Link>
            <Link to="/" className="btn btn-ghost">
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
