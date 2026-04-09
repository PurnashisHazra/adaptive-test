import type { ReactNode } from "react";

type Props = {
  title: string;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
};

export function AdminPanel({ title, actions, filters, children }: Props) {
  return (
    <div className="admin-panel">
      <header className="admin-panel-header">
        <h1 style={{ margin: 0, fontSize: "1.35rem" }}>{title}</h1>
        {actions ? (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>{actions}</div>
        ) : null}
      </header>
      {filters ? <div className="admin-panel-filters">{filters}</div> : null}
      <div className="admin-panel-body">{children}</div>
    </div>
  );
}
