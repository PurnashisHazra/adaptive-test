import type { ReactNode } from "react";
import { StudentSubNav } from "./StudentSubNav";

type Props = {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  /** Constrain main column width (forms, profile). */
  narrow?: boolean;
  /** Elevated white panel on gray stage (student hub pages). */
  panel?: boolean;
  /** Secondary nav between Performance, Results, Analytics, etc. */
  showSubNav?: boolean;
  className?: string;
  children: ReactNode;
};

export function AppPage({
  title,
  lead,
  actions,
  filters,
  narrow,
  panel = false,
  showSubNav = false,
  className,
  children,
}: Props) {
  const pageClass = ["page", "app-page", narrow ? "app-page--narrow" : "", panel ? "app-page--panel" : "", className]
    .filter(Boolean)
    .join(" ");

  const header = (
    <header className={panel ? "student-panel-header" : "app-page-header"}>
      <div className={panel ? "student-panel-header__text" : "app-page-header__text"}>
        <h1>{title}</h1>
        {lead ? <div className="app-page-lead">{lead}</div> : null}
      </div>
      {actions ? <div className="app-page-actions">{actions}</div> : null}
    </header>
  );

  if (panel) {
    return (
      <div className={pageClass}>
        {showSubNav ? <StudentSubNav /> : null}
        <div className={`student-panel${narrow ? " student-panel--narrow" : ""}`}>
          {header}
          {filters ? <div className="student-panel-filters">{filters}</div> : null}
          <div className="student-panel-body">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      {showSubNav ? <StudentSubNav /> : null}
      {header}
      {filters ? <div className="app-page-filters">{filters}</div> : null}
      <div className="app-page-body">{children}</div>
    </div>
  );
}
