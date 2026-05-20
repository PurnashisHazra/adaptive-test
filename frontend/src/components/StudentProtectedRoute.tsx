import { ReactNode } from "react";
import { RequireRole } from "./RequireRole";
import { RequireStudentOnboarded } from "./RequireStudentOnboarded";

export function StudentProtectedRoute(props: {
  children: ReactNode;
  studentRedirectTo?: string;
  /** When false, only a student login is required (e.g. challenges, analytics). */
  requireInstructor?: boolean;
}) {
  const requireInstructor = props.requireInstructor !== false;
  return (
    <RequireRole
      allowedRoles={["student"]}
      studentRedirectTo={props.studentRedirectTo}
      adminRedirectTo="/admin"
      superAdminRedirectTo="/super-admin"
    >
      {requireInstructor ? <RequireStudentOnboarded>{props.children}</RequireStudentOnboarded> : props.children}
    </RequireRole>
  );
}
