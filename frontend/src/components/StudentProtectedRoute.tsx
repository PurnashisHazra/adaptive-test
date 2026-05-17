import { ReactNode } from "react";
import { RequireRole } from "./RequireRole";
import { RequireStudentOnboarded } from "./RequireStudentOnboarded";

export function StudentProtectedRoute(props: { children: ReactNode; studentRedirectTo?: string }) {
  return (
    <RequireRole
      allowedRoles={["student"]}
      studentRedirectTo={props.studentRedirectTo}
      adminRedirectTo="/admin"
      superAdminRedirectTo="/super-admin"
    >
      <RequireStudentOnboarded>{props.children}</RequireStudentOnboarded>
    </RequireRole>
  );
}
