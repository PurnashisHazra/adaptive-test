import type { ReactNode } from "react";

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="student-page-loading" aria-busy="true" aria-live="polite">
      <div className="skeleton student-page-loading__bar" />
      <div className="skeleton student-page-loading__bar student-page-loading__bar--short" />
      <p className="student-page-loading__label">{label}</p>
    </div>
  );
}

export function PageEmpty({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="student-empty card">
      {title ? <h3 className="student-empty__title">{title}</h3> : null}
      <p className="student-empty__text">{children}</p>
      {action ? <div className="student-empty__action">{action}</div> : null}
    </div>
  );
}
