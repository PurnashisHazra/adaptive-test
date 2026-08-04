import type { ReactNode } from "react";

type Props = {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
};

export function AdminPanel({ title, lead, actions, filters, children }: Props) {
  return (
    <div className="admin-panel">
      <header className="admin-panel-header">
        <div className="admin-panel-header__text">
          <h1>{title}</h1>
          {lead ? <p className="app-page-lead">{lead}</p> : null}
        </div>
        {actions ? <div className="admin-panel-actions">{actions}</div> : null}
      </header>
      {filters ? <div className="admin-panel-filters">{filters}</div> : null}
      <div className="admin-panel-body">{children}</div>
    </div>
  );
}
