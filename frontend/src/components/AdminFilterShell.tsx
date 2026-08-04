import type { ReactNode } from "react";

export function AdminFilterShell({ children }: { children: ReactNode }) {
  return <div className="admin-filter-shell">{children}</div>;
}
