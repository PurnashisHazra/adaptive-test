import type { AdminStudentReportPdfBundle } from "../api/types";
import { StudentLearningTrendCharts } from "./StudentLearningTrendCharts";
import { StudentOverallRadar2D, StudentOverallStrategyPanel } from "./StudentOverallRadar2D";
import { StudentPastAttemptsStrategyBlock, type StrategyBlockPrefetched } from "./StudentPastAttemptsStrategyBlock";

const emptyFilters = { subject: "", topic: "", exam: "" };

function statusLabel(status: string): string {
  switch (status) {
    case "on_track":
      return "Following strategy";
    case "partial":
      return "Partially following strategy";
    case "needs_focus":
      return "Needs strategy focus";
    default:
      return "Insufficient data";
  }
}

function coachStatusLabel(status: string, hints: number): string {
  switch (status) {
    case "active":
      return hints > 0 ? `Live coach active (${hints} explanation hints)` : "Live coach active";
    case "plan_ready":
      return "Coach plan saved";
    default:
      return "Live coach not engaged";
  }
}

export function AdminStudentAnalyticsPrintView({ bundle }: { bundle: AdminStudentReportPdfBundle }) {
  const { report, trends } = bundle;
  const name = report.display_name?.trim() || report.student_username;
  const hasTrendPoints = trends.points.length > 0;

  const prefetched: StrategyBlockPrefetched | null =
    report.latest_attempt && report.latest_attempt_detail
      ? {
          attemptId: report.latest_attempt.attempt_id,
          detail: report.latest_attempt_detail,
          timeCoach: bundle.time_strategy ?? null,
          accuracyCoach: bundle.accuracy_improvement ?? null,
        }
      : null;

  return (
    <div className="admin-analytics-print" data-analytics-print-root>
      <header className="admin-analytics-print__header">
        <p className="admin-analytics-print__eyebrow">Student report card</p>
        <h1 className="admin-analytics-print__title">{name}</h1>
        <p className="admin-analytics-print__sub">@{report.student_username} · Generated {new Date().toLocaleString()}</p>
        <div className="admin-analytics-print__badges">
          <span className="report-card-badge report-card-badge--good">{statusLabel(report.strategy_follow_status)}</span>
          <span className="report-card-badge report-card-badge--coach">
            {coachStatusLabel(report.live_coach_status, report.coach_explanation_hints_total)}
          </span>
        </div>
        <div className="admin-analytics-print__summary-grid">
          <div>
            <span className="label">Sessions</span>
            <p style={{ margin: "0.2rem 0 0", fontWeight: 700 }}>{report.tests_taken}</p>
          </div>
          <div>
            <span className="label">Avg accuracy</span>
            <p style={{ margin: "0.2rem 0 0", fontWeight: 700 }}>
              {report.average_accuracy_percent != null ? `${report.average_accuracy_percent.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div>
            <span className="label">Strategy adherence</span>
            <p style={{ margin: "0.2rem 0 0", fontWeight: 700 }}>
              {report.strategy_follow_percent != null ? `${report.strategy_follow_percent.toFixed(0)}%` : "—"}
            </p>
          </div>
        </div>
        {report.strategy_follow_note ? <p className="admin-analytics-print__note">{report.strategy_follow_note}</p> : null}
        {report.live_coach_note ? <p className="admin-analytics-print__note">{report.live_coach_note}</p> : null}
      </header>

      {hasTrendPoints ? (
        <section className="review-progress-section admin-analytics-print__section">
          <h2 className="admin-analytics-print__section-title">Learning curves</h2>
          <StudentLearningTrendCharts
            data={trends}
            filters={emptyFilters}
            hideFilterRow
            omitSectionChrome
          />
          <StudentOverallRadar2D data={report.overall ?? null} printMode />
          <StudentOverallStrategyPanel data={report.overall ?? null} />
          <StudentPastAttemptsStrategyBlock
            trends={trends}
            filters={emptyFilters}
            overall={report.overall ?? null}
            prefetched={prefetched}
            printMode
          />
        </section>
      ) : (
        <div className="card admin-analytics-print__section">
          <p style={{ margin: 0, color: "var(--muted)" }}>
            No completed attempts with answers yet — charts will appear after the student takes tests.
          </p>
        </div>
      )}
    </div>
  );
}
