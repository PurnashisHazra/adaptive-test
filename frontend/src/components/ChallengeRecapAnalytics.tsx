import { useMemo, type CSSProperties } from "react";
import { AttemptBubbleChart, type BubbleChartStep } from "./AttemptBubbleChart";
import { PaperReviewDifficultyChart } from "./PaperReviewDifficultyChart";
import { RunningMetricTwinLinesChart } from "./StudentPastAttemptsStrategyBlock";
import { StrategyFootnoteVisual } from "./StrategyFootnoteVisual";
import { StudentPerformanceSpiderChart } from "./StudentPerformanceSpiderChart";
import type {
  ChallengeKnowledgeGapItem,
  ChallengeRecapResponse,
  StudentPerformanceInsights,
  StudentQuestionReview,
} from "../api/types";
import { buildStrategyCounterfactualInsights, computeRunningAccuracySeries } from "../lib/strategyCounterfactual";

function reviewsToBubbleSteps(questions: StudentQuestionReview[]): BubbleChartStep[] {
  return [...questions]
    .sort((a, b) => a.index - b.index)
    .map((q) => ({
      sequence: q.index,
      question_text: q.question_text,
      difficulty: (q.difficulty_when_served || "EASY").toString(),
      time_spent_seconds: q.time_spent_seconds ?? null,
      is_correct: q.is_correct,
    }));
}

function formatSecondsAxis(s: number): string {
  const v = Math.round(Math.max(0, s));
  if (v >= 3600) return `${Math.round(v / 3600)}h`;
  if (v >= 60) return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
  return `${v}s`;
}

function gapToneClass(tone: string): string {
  switch (tone) {
    case "accent":
      return "strategy-insight-card--accent";
    case "time":
      return "strategy-insight-card--time";
    case "warn":
      return "strategy-insight-card--warn";
    default:
      return "strategy-insight-card--neutral";
  }
}

function KnowledgeGapsPanel({ gaps }: { gaps: ChallengeKnowledgeGapItem[] }) {
  if (gaps.length === 0) {
    return (
      <p style={{ margin: "1rem 0 0", color: "var(--muted)", fontSize: "0.92rem" }}>
        No major knowledge gaps flagged on this attempt — keep practising to sharpen your profile.
      </p>
    );
  }

  return (
    <div className="strategy-insights__cards" style={{ marginTop: "1.25rem" }}>
      <h4 className="strategy-insights__cards-title">Knowledge gaps</h4>
      <p className="strategy-insights__lead" style={{ marginBottom: "0.85rem" }}>
        Themes to fix next — grouped by difficulty, topic, and behaviour signals (not question-by-question).
      </p>
      <div className="strategy-insights__cards-grid">
        {gaps.map((gap, i) => (
          <article key={`${gap.title}-${i}`} className={["strategy-insight-card", gapToneClass(gap.tone)].join(" ")}>
            <div className="strategy-insight-card__head">
              <h6 className="strategy-insight-card__title">{gap.title}</h6>
              {gap.metric ? <span className="strategy-insight-card__metric">{gap.metric}</span> : null}
            </div>
            <p className="strategy-insight-card__body">{gap.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function InsightsSummary({
  insights,
  questions,
}: {
  insights: StudentPerformanceInsights;
  questions: StudentQuestionReview[];
}) {
  const chip: CSSProperties = {
    display: "inline-block",
    padding: "0.35rem 0.55rem",
    borderRadius: 8,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    fontSize: "0.85rem",
    color: "#334155",
  };

  return (
    <>
      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
        <span style={chip}>Accuracy: {insights.accuracy_percent.toFixed(1)}%</span>
        <span style={chip}>Avg time/question: {insights.avg_time_seconds != null ? `${insights.avg_time_seconds}s` : "—"}</span>
        <span style={chip}>Wasted time questions: {insights.wasted_time_questions}</span>
        <span style={chip}>Missed opportunities: {insights.missed_opportunity_questions}</span>
        <span style={chip}>Should skip & revisit: {insights.skip_candidate_questions}</span>
      </div>

      <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.7rem" }}>
        {insights.strong_areas.length > 0 ? (
          <div>
            <strong style={{ color: "#166534" }}>Good at:</strong>{" "}
            {insights.strong_areas
              .map((x) => `${x.name} (${x.accuracy_percent.toFixed(0)}% over ${x.attempts})`)
              .join(", ")}
          </div>
        ) : null}
        {insights.weak_areas.length > 0 ? (
          <div>
            <strong style={{ color: "#991b1b" }}>Needs improvement:</strong>{" "}
            {insights.weak_areas
              .map((x) => `${x.name} (${x.accuracy_percent.toFixed(0)}% over ${x.attempts})`)
              .join(", ")}
          </div>
        ) : null}
      </div>

      {questions.length > 0 ? <StudentPerformanceSpiderChart insights={insights} questions={questions} /> : null}
    </>
  );
}

export function ChallengeRecapAnalytics({ recap }: { recap: ChallengeRecapResponse }) {
  const { insights, questions, knowledge_gaps: knowledgeGaps } = recap;
  const chartKey = recap.paper_summary.paper_attempt_id;

  const series = useMemo(() => {
    if (!questions.length) return null;
    return computeRunningAccuracySeries(questions, null);
  }, [questions]);

  const strategyInsights = useMemo(() => {
    if (!series) return null;
    return buildStrategyCounterfactualInsights(null, series);
  }, [series]);

  const timeYMax = useMemo(() => {
    if (!series?.timeActual.length) return 60;
    const mx = Math.max(5, ...series.timeActual, ...series.timeStrategy);
    return Math.ceil(mx * 1.08);
  }, [series]);

  const bubbleSteps = useMemo(() => (questions.length ? reviewsToBubbleSteps(questions) : []), [questions]);

  return (
    <div className="card" style={{ marginTop: "1.25rem" }}>
      <h3 style={{ marginTop: 0 }}>Your mini analytics</h3>
      <p style={{ margin: "0 0 0.75rem", color: "var(--muted)", fontSize: "0.95rem" }}>
        Same charts and signals as Performance — scoped to this challenge attempt.
      </p>

      <InsightsSummary insights={insights} questions={questions} />

      {bubbleSteps.length > 0 ? (
        <div className="strategy-well" style={{ marginTop: "1.25rem" }}>
          <h4 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Question flow</h4>
          <AttemptBubbleChart steps={bubbleSteps} chartKey={chartKey} />
        </div>
      ) : null}

      {questions.length > 0 ? <PaperReviewDifficultyChart questions={questions} embedded /> : null}

      {series ? (
        <section className="strategy-curves" aria-label="Running accuracy and time curves" style={{ marginTop: "1.25rem" }}>
          <h4 className="strategy-curves__title">Curves</h4>
          <p className="strategy-curves__lead">
            Green = your running accuracy / cumulative time. Blue dashed = illustrative path if strategy habits converted on misses.
          </p>
          <div className="strategy-curves__grid">
            <div className="strategy-column">
              <h5 className="strategy-column__title">Running accuracy</h5>
              <div className="strategy-column__chart">
                <RunningMetricTwinLinesChart
                  chartKey={chartKey}
                  variant="acc"
                  n={series.n}
                  actual={series.actual}
                  strategy={series.strategy}
                  yAxisLabel="Running accuracy %"
                  yMin={0}
                  yMax={100}
                  formatTick={(v) => `${Math.round(v)}%`}
                  ariaLabel={`Running accuracy for challenge ${chartKey}`}
                  legendActual="Actual running accuracy"
                  legendStrategy="Strategy-adjusted accuracy (illustrative)"
                />
              </div>
            </div>
            <div className="strategy-column">
              <h5 className="strategy-column__title">Cumulative time</h5>
              <div className="strategy-column__chart">
                <RunningMetricTwinLinesChart
                  chartKey={chartKey}
                  variant="time"
                  n={series.n}
                  actual={series.timeActual}
                  strategy={series.timeStrategy}
                  yAxisLabel="Cumulative time"
                  yMin={0}
                  yMax={timeYMax}
                  formatTick={formatSecondsAxis}
                  ariaLabel={`Cumulative time for challenge ${chartKey}`}
                  legendActual="Actual cumulative time"
                  legendStrategy="Strategy-adjusted time (illustrative)"
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {strategyInsights ? <StrategyFootnoteVisual insights={strategyInsights} /> : null}

      <KnowledgeGapsPanel gaps={knowledgeGaps} />
    </div>
  );
}
