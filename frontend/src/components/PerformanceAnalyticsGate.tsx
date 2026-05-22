import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function PerformanceAnalyticsGate({
  unlocked,
  children,
  minHeight = 200,
}: {
  unlocked: boolean;
  children: ReactNode;
  minHeight?: number;
}) {
  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="performance-analytics-gate" style={{ minHeight }}>
      <div className="performance-analytics-gate__blur" aria-hidden="true">
        {children}
      </div>
      <div className="performance-analytics-gate__overlay" role="region" aria-label="Analytics locked">
        <div className="performance-analytics-gate__card">
          <p className="performance-analytics-gate__title">Analytics locked</p>
          <p className="performance-analytics-gate__text">
            Add your phone number on your profile to view strategy insights and detailed attempt analytics.
          </p>
          <Link to="/profile" className="btn btn-primary performance-analytics-gate__cta">
            Add phone number
          </Link>
        </div>
      </div>
    </div>
  );
}
