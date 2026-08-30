import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../api/types";

export function RequireRole(props: {
  allowedRoles: Role[];
  studentRedirectTo?: string;
  adminRedirectTo?: string;
  superAdminRedirectTo?: string;
  children: ReactNode;
}) {
  const role = useAuthStore((s) => s.role);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const location = useLocation();

  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  if (!isHydrated) return <div className="page">Loading…</div>;
  if (!role) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  if (!props.allowedRoles.includes(role)) {
    const target =
      role === "god" || role === "super_admin"
        ? props.superAdminRedirectTo ?? "/super-admin"
        : role === "admin"
          ? props.adminRedirectTo ?? "/admin"
          : props.studentRedirectTo ?? "/";
    return <Navigate to={target} replace />;
  }

  return <>{props.children}</>;
}
