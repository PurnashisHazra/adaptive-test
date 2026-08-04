import type { ReactNode } from "react";

type Props = {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  /** Constrain main column width (forms, profile). */
  narrow?: boolean;
  className?: string;
  children: ReactNode;
};

export function AppPage({ title, lead, actions, filters, narrow, className, children }: Props) {
  return (
    <div className={["page", "app-page", narrow ? "app-page--narrow" : "", className].filter(Boolean).join(" ")}>
      <header className="app-page-header">
        <div className="app-page-header__text">
          <h1>{title}</h1>
          {lead ? <div className="app-page-lead">{lead}</div> : null}
        </div>
        {actions ? <div className="app-page-actions">{actions}</div> : null}
      </header>
      {filters ? <div className="app-page-filters">{filters}</div> : null}
      <div className="app-page-body">{children}</div>
    </div>
  );
}
