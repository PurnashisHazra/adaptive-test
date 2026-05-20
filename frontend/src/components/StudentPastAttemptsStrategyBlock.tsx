import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getMyAttemptAccuracyImprovement, getMyAttemptTimeStrategy, getMyStandaloneReview } from "../api/client";
import type {
  StudentAttemptAccuracyImprovementResponse,
  StudentAttemptTimeStrategyResponse,
  StudentLearningTrendsResponse,
  StudentOverallAnalytics,
  StudentSessionFilters,
  StudentStandaloneDetail,
  StudentTrendPoint,
  StudentQuestionReview,
  AccuracyBuildCategory,
} from "../api/types";
import { formatDateTimeIST } from "../lib/istTime";
import { AttemptBubbleChart, type BubbleChartStep } from "./AttemptBubbleChart";
import { buildStrategyCounterfactualInsights, computeRunningAccuracySeries, orderedQuestions } from "../lib/strategyCounterfactual";
import { StrategyFootnoteVisual } from "./StrategyFootnoteVisual";

function filterTrendPoints(points: StudentTrendPoint[], filters: StudentSessionFilters): StudentTrendPoint[] {
  const { subject, topic, exam } = filters;
  return points.filter((p) => {
    if (subject && (p.subject ?? "") !== subject) return false;
    if (topic && (p.topic ?? "") !== topic) return false;
    if (exam && (p.exam_tag ?? "") !== exam) return false;
    return true;
  });
}

function pointLabel(p: StudentTrendPoint): string {
  const d = formatDateTimeIST(p.started_at);
  const kind = p.session_kind === "paper_section" ? "Paper section" : "Adaptive test";
  return `${d} · ${kind} · ${p.score}/${p.questions_answered} (${Math.round(p.accuracy_percent)}%)`;
}

function reviewsToBubbleSteps(questions: StudentQuestionReview[]): BubbleChartStep[] {
  return orderedQuestions(questions).map((q) => ({
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

function accuracyCategoryStyle(cat: AccuracyBuildCategory): { bg: string; fg: string; label: string } {
  switch (cat) {
    case "trick":
      return { bg: "rgba(217,119,6,0.15)", fg: "#b45309", label: "Exam trick" };
    case "formula":
      return { bg: "rgba(147,51,234,0.12)", fg: "#7e22ce", label: "Formula" };
    case "deep_knowledge":
      return { bg: "rgba(51,65,85,0.14)", fg: "#334155", label: "Deep knowledge" };
    case "mixed":
      return { bg: "rgba(14,165,233,0.12)", fg: "#0369a1", label: "Mixed" };
    case "concept":
    default:
      return { bg: "rgba(59,130,246,0.12)", fg: "#1d4ed8", label: "Concept" };
  }
}

function alignAiCumulative(raw: number[] | undefined, n: number): number[] | null {
  if (!raw?.length || n <= 0) return null;
  const s = raw.map((x) => Math.max(0, Number(x)));
  if (s.length === n) return s;
  if (s.length > n) return s.slice(0, n);
  const last = s[s.length - 1] ?? 0;
  while (s.length < n) s.push(last);
  for (let i = 1; i < s.length; i++) {
    if (s[i] < s[i - 1]) s[i] = s[i - 1];
  }
  return s;
}

function RunningMetricTwinLinesChart({
  chartKey,
  variant,
  n,
  actual,
  strategy,
  yAxisLabel,
  yMin,
  yMax,
  formatTick,
  ariaLabel,
  legendActual,
  legendStrategy,
  chartW = 560,
  chartH = 200,
  aiOptimal = null,
  aiOptimalLegend,
  skipAtIndices,
  deferAtIndices,
  capAtIndices,
}: {
  chartKey: string;
  variant: string;
  n: number;
  actual: number[];
  strategy: number[];
  yAxisLabel: string;
  yMin: number;
  yMax: number;
  formatTick: (v: number) => string;
  ariaLabel: string;
  legendActual: string;
  legendStrategy: string;
  chartW?: number;
  chartH?: number;
  aiOptimal?: number[] | null;
  aiOptimalLegend?: string;
  skipAtIndices?: number[];
  deferAtIndices?: number[];
  capAtIndices?: number[];
}) {
  const padL = 52;
  const padR = 18;
  const hasMarkers =
    (skipAtIndices?.length ?? 0) + (deferAtIndices?.length ?? 0) + (capAtIndices?.length ?? 0) > 0 || Boolean(aiOptimal?.length);
  const padT = 12 + (hasMarkers ? 10 : 0);
  const padB = 36;
  const maxX = Math.max(1, n);
  const lo = yMin;
  const hi = yMax <= yMin ? yMin + 1e-6 : yMax;
  const xToPx = (seq: number) => padL + ((seq - 1) / Math.max(1, maxX - 1)) * (chartW - padL - padR);
  const yToPx = (y: number) => chartH - padB - ((y - lo) / (hi - lo)) * (chartH - padT - padB);

  const xs = Array.from({ length: n }, (_, i) => i + 1);
  const toPoints = (ys: number[]) => xs.map((x, i) => `${xToPx(x).toFixed(2)},${yToPx(ys[i]).toFixed(2)}`).join(" ");
  const showAi = Boolean(aiOptimal && aiOptimal.length === n);

  return (
    <div className="table-wrap" style={{ overflowX: "auto", paddingBottom: "0.25rem" }}>
      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        width="100%"
        height={chartH}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
        style={{ display: "block", maxWidth: "100%", minWidth: Math.min(chartW, 320) }}
      >
        <line x1={padL} y1={chartH - padB} x2={chartW - padR} y2={chartH - padB} stroke="#cbd5e1" />
        <line x1={padL} y1={padT} x2={padL} y2={chartH - padB} stroke="#cbd5e1" />
        <text x={chartW / 2} y={chartH - 8} textAnchor="middle" fill="#64748b" fontSize="12">
          Question sequence
        </text>
        <text x={18} y={chartH / 2} textAnchor="middle" transform={`rotate(-90 18 ${chartH / 2})`} fill="#64748b" fontSize="12">
          {yAxisLabel}
        </text>
        {[0, 0.25, 0.5, 0.75, 1].map((r) => {
          const yVal = lo + (hi - lo) * r;
          const y = yToPx(yVal);
          return (
            <g key={`${chartKey}-${variant}-y-${r}`}>
              <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#f1f5f9" />
              <text x={padL - 8} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="11">
                {formatTick(yVal)}
              </text>
            </g>
          );
        })}
        {(skipAtIndices ?? []).map((idx) => {
          const x = xToPx(idx);
          return (
            <g key={`${chartKey}-${variant}-skip-${idx}`}>
              <line x1={x} y1={padT} x2={x} y2={chartH - padB} stroke="#ea580c" strokeWidth={1.75} strokeDasharray="5 4" opacity={0.92} />
              <text x={x} y={padT + 9} textAnchor="middle" fill="#c2410c" fontSize="9" fontWeight={700}>
                Skip?
              </text>
            </g>
          );
        })}
        {(deferAtIndices ?? []).map((idx) => {
          const x = xToPx(idx);
          const y = padT + 6;
          return (
            <polygon
              key={`${chartKey}-${variant}-def-${idx}`}
              points={`${x},${y - 4} ${x - 5},${y + 4} ${x + 5},${y + 4}`}
              fill="#d97706"
              stroke="#fff"
              strokeWidth={0.75}
              opacity={0.95}
            >
              <title>Defer / revisit later (coach)</title>
            </polygon>
          );
        })}
        {(capAtIndices ?? []).map((idx) => {
          const x = xToPx(idx);
          const y = padT + 6;
          return (
            <rect
              key={`${chartKey}-${variant}-cap-${idx}`}
              x={x - 4}
              y={y - 4}
              width={8}
              height={8}
              rx={1}
              fill="#9333ea"
              stroke="#fff"
              strokeWidth={0.75}
              opacity={0.95}
            >
              <title>Time cap (coach)</title>
            </rect>
          );
        })}
        <polyline
          fill="none"
          stroke="#059669"
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={toPoints(actual)}
        />
        <polyline
          fill="none"
          stroke="#0284c7"
          strokeWidth={2.25}
          strokeDasharray="7 5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={toPoints(strategy)}
        />
        {showAi && aiOptimal ? (
          <polyline
            fill="none"
            stroke="#7c3aed"
            strokeWidth={2.1}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={toPoints(aiOptimal)}
          />
        ) : null}
        {xs.map((x) => (
          <circle key={`${chartKey}-${variant}-dot-a-${x}`} cx={xToPx(x)} cy={yToPx(actual[x - 1])} r={3.5} fill="#059669" stroke="#fff" strokeWidth={1} />
        ))}
        {xs.map((x) => (
          <circle key={`${chartKey}-${variant}-dot-s-${x}`} cx={xToPx(x)} cy={yToPx(strategy[x - 1])} r={3.5} fill="#0284c7" stroke="#fff" strokeWidth={1} />
        ))}
        {showAi && aiOptimal
          ? xs.map((x) => (
              <circle key={`${chartKey}-${variant}-dot-ai-${x}`} cx={xToPx(x)} cy={yToPx(aiOptimal[x - 1])} r={3} fill="#7c3aed" stroke="#fff" strokeWidth={1} />
            ))
          : null}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1rem", marginTop: "0.35rem", fontSize: "0.78rem", color: "var(--muted)" }}>
        <span>
          <span style={{ color: "#059669", fontWeight: 600 }}>●</span> {legendActual}
        </span>
        <span>
          <span style={{ color: "#0284c7", fontWeight: 600 }}>●</span> {legendStrategy}
        </span>
        {showAi && aiOptimalLegend ? (
          <span>
            <span style={{ color: "#7c3aed", fontWeight: 600 }}>●</span> {aiOptimalLegend}
          </span>
        ) : null}
        {(skipAtIndices?.length ?? 0) > 0 ? (
          <span>
            <span style={{ color: "#ea580c", fontWeight: 600 }}>|</span> Orange dashed = coach skip-if-behind
          </span>
        ) : null}
        {(deferAtIndices?.length ?? 0) > 0 ? (
          <span>
            <span style={{ color: "#d97706" }}>▲</span> Defer / revisit
          </span>
        ) : null}
        {(capAtIndices?.length ?? 0) > 0 ? (
          <span>
            <span style={{ color: "#9333ea" }}>■</span> Time cap
          </span>
        ) : null}
      </div>
    </div>
  );
}

export type StrategyBlockPrefetched = {
  attemptId: string;
  detail: StudentStandaloneDetail;
  timeCoach: StudentAttemptTimeStrategyResponse | null;
  accuracyCoach: StudentAttemptAccuracyImprovementResponse | null;
};

export function StudentPastAttemptsStrategyBlock({
  trends,
  filters,
  overall,
  prefetched,
  printMode = false,
}: {
  trends: StudentLearningTrendsResponse;
  filters: StudentSessionFilters;
  overall: StudentOverallAnalytics | null;
  prefetched?: StrategyBlockPrefetched | null;
  printMode?: boolean;
}) {
  const filtered = useMemo(() => {
    const rows = filterTrendPoints(trends.points, filters);
    return [...rows].sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime() || a.attempt_id.localeCompare(b.attempt_id),
    );
  }, [trends.points, filters.subject, filters.topic, filters.exam]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudentStandaloneDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeCoach, setTimeCoach] = useState<StudentAttemptTimeStrategyResponse | null>(null);
  const [loadingTimeCoach, setLoadingTimeCoach] = useState(false);
  const [accuracyCoach, setAccuracyCoach] = useState<StudentAttemptAccuracyImprovementResponse | null>(null);
  const [loadingAccuracyCoach, setLoadingAccuracyCoach] = useState(false);

  useEffect(() => {
    if (prefetched) {
      setSelectedId(prefetched.attemptId);
      setDetail(prefetched.detail);
      setTimeCoach(prefetched.timeCoach);
      setAccuracyCoach(prefetched.accuracyCoach);
      setLoading(false);
      setLoadingTimeCoach(false);
      setLoadingAccuracyCoach(false);
      return;
    }
    if (!filtered.length) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    const latest = filtered[filtered.length - 1];
    setSelectedId((prev) => (prev && filtered.some((p) => p.attempt_id === prev) ? prev : latest.attempt_id));
  }, [filtered, prefetched]);

  useEffect(() => {
    if (prefetched) return;
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMyStandaloneReview(selectedId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load attempt detail");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, prefetched]);

  useEffect(() => {
    if (prefetched) return;
    if (!selectedId) {
      setTimeCoach(null);
      return;
    }
    let cancelled = false;
    setTimeCoach(null);
    setLoadingTimeCoach(true);
    getMyAttemptTimeStrategy(selectedId, {
      subject: filters.subject.trim() || undefined,
      topic: filters.topic.trim() || undefined,
      exam_tag: filters.exam.trim() || undefined,
    })
      .then((r) => {
        if (!cancelled) setTimeCoach(r);
      })
      .catch(() => {
        if (!cancelled) {
          setTimeCoach(null);
          toast.error("Could not load AI time coach");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTimeCoach(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, filters.subject, filters.topic, filters.exam, prefetched]);

  useEffect(() => {
    if (prefetched) return;
    if (!selectedId) {
      setAccuracyCoach(null);
      return;
    }
    let cancelled = false;
    setAccuracyCoach(null);
    setLoadingAccuracyCoach(true);
    getMyAttemptAccuracyImprovement(selectedId, {
      subject: filters.subject.trim() || undefined,
      topic: filters.topic.trim() || undefined,
      exam_tag: filters.exam.trim() || undefined,
    })
      .then((r) => {
        if (!cancelled) setAccuracyCoach(r);
      })
      .catch(() => {
        if (!cancelled) {
          setAccuracyCoach(null);
          toast.error("Could not load AI accuracy coach");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAccuracyCoach(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, filters.subject, filters.topic, filters.exam, prefetched]);

  const series = useMemo(() => {
    if (!detail?.questions.length) return null;
    return computeRunningAccuracySeries(detail.questions, overall);
  }, [detail, overall]);

  const strategyInsights = useMemo(() => {
    if (!series) return null;
    return buildStrategyCounterfactualInsights(overall, series);
  }, [overall, series]);

  const timeYMax = useMemo(() => {
    if (!series?.timeActual.length) return 60;
    const mx = Math.max(5, ...series.timeActual, ...series.timeStrategy);
    const ai = alignAiCumulative(timeCoach?.cumulative_optimal_seconds, series.n);
    const aiMx = ai?.length ? Math.max(...ai, 0) : 0;
    return Math.ceil(Math.max(mx, aiMx) * 1.08);
  }, [series, timeCoach]);

  const coachAiAligned = useMemo(
    () => (series?.n ? alignAiCumulative(timeCoach?.cumulative_optimal_seconds, series.n) : null),
    [series?.n, timeCoach],
  );

  const coachSkipAt = useMemo(
    () => (timeCoach?.per_question ?? []).filter((p) => p.time_action === "skip_if_behind").map((p) => p.index),
    [timeCoach],
  );
  const coachDeferAt = useMemo(
    () => (timeCoach?.per_question ?? []).filter((p) => p.time_action === "defer_revisit").map((p) => p.index),
    [timeCoach],
  );
  const coachCapAt = useMemo(
    () => (timeCoach?.per_question ?? []).filter((p) => p.time_action === "time_cap").map((p) => p.index),
    [timeCoach],
  );

  const coachPerQuestionHighlights = useMemo(() => {
    const rows = timeCoach?.per_question ?? [];
    return rows.filter((p) => p.time_action !== "full_attempt" || p.risk_level === "high");
  }, [timeCoach]);

  const bubbleSteps = useMemo(() => (detail?.questions.length ? reviewsToBubbleSteps(detail.questions) : []), [detail]);

  const selectedPoint = filtered.find((p) => p.attempt_id === selectedId);

  if (!filtered.length) {
    return (
      <article className="card strategy-session">
        <header className="strategy-session__head">
          <h3 className="strategy-session__title">Past attempts — pacing & study lift</h3>
          <p className="strategy-session__intro">No attempts match the current subject, topic, and exam filters.</p>
        </header>
      </article>
    );
  }

  return (
    <article className="card strategy-session">
      <header className="strategy-session__head">
        <h3 className="strategy-session__title">Past attempts — pacing & study lift</h3>
        <p className="strategy-session__intro">
          Bubble chart: question order, time, difficulty-sized markers. Curves compare your running accuracy and cumulative time to
          heuristics; with <code style={{ fontSize: "0.85em" }}>OPENAI_API_KEY</code>, the left column adds a subject- and exam-aware study
          build plan, and the right column adds pacing, skips, and an optimal time curve.
        </p>
      </header>

      {printMode ? null : (
      <div className="strategy-session__toolbar">
        <div className="strategy-session__toolbar-field">
          <label className="label" htmlFor="student-attempt-strategy-select">
            Attempt
          </label>
          <select
            id="student-attempt-strategy-select"
            className="input"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            {[...filtered].reverse().map((p) => (
              <option key={p.attempt_id} value={p.attempt_id}>
                {pointLabel(p)}
              </option>
            ))}
          </select>
        </div>
      </div>
      )}

      {selectedPoint ? (
        <p className="strategy-session__meta">
          <strong>{detail?.title ?? "…"}</strong>
          {detail ? (
            <span style={{ color: "var(--muted)" }}>
              {" "}
              · {detail.score}/{detail.total_questions}
              {detail.percentage != null ? ` (${detail.percentage}%)` : ""}
            </span>
          ) : null}
        </p>
      ) : null}

      {loading ? <p className="strategy-status">Loading attempt…</p> : null}

      {!loading && detail && bubbleSteps.length > 0 ? (
        <>
          <div className="strategy-well">
            <AttemptBubbleChart steps={bubbleSteps} chartKey={detail.attempt_id} />
          </div>

          <section className="strategy-curves" aria-label="Running accuracy and time curves">
            <h4 className="strategy-curves__title">Curves &amp; AI coaching</h4>
            <p className="strategy-curves__lead">
              Each column shows the running curve first, then the Adaptest AI plan, then supporting detail (scroll if needed). Accuracy:
              green = your running %, blue = heuristic path. Time: same colours plus purple optimal cumulative time; markers show skip /
              defer / cap suggestions.
            </p>
            {series ? (
              <div className="strategy-curves__grid">
                <div className="strategy-column">
                  <h5 className="strategy-column__title">Accuracy &amp; study build</h5>
                  <div className="strategy-column__chart">
                    <RunningMetricTwinLinesChart
                      chartKey={detail.attempt_id}
                      variant="acc"
                      n={series.n}
                      actual={series.actual}
                      strategy={series.strategy}
                      yAxisLabel="Running accuracy %"
                      yMin={0}
                      yMax={100}
                      formatTick={(v) => `${Math.round(v)}%`}
                      ariaLabel={`Running accuracy for attempt ${detail.attempt_id}`}
                      legendActual="Actual running accuracy"
                      legendStrategy="Strategy-adjusted accuracy (illustrative)"
                    />
                  </div>
                  <div className="strategy-column__body">
                  {loadingAccuracyCoach ? <p className="strategy-status">Loading AI accuracy coach…</p> : null}
                  {!loadingAccuracyCoach && accuracyCoach && !accuracyCoach.openai_configured ? (
                    <p className="strategy-status">OpenAI is not configured — only the heuristic accuracy curve (blue) is shown.</p>
                  ) : null}
                  {!loadingAccuracyCoach && accuracyCoach?.openai_configured && accuracyCoach.error ? (
                    <p className="strategy-status strategy-status--warn">AI coach: {accuracyCoach.error}</p>
                  ) : null}
                  {accuracyCoach?.used_openai && accuracyCoach.summary ? (
                    <div className="strategy-coach-panel">
                      <p>
                        <strong>Adaptest AI accuracy plan</strong> — {accuracyCoach.summary}
                      </p>
                    </div>
                  ) : null}
                  {accuracyCoach?.used_openai &&
                  (accuracyCoach.subject_context ||
                    accuracyCoach.exam_context ||
                    accuracyCoach.build_items.length > 0 ||
                    (accuracyCoach.practice_drills?.length ?? 0) > 0) ? (
                    <div className="strategy-coach-panel strategy-coach-panel--detail">
                      <p style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                        <strong>Subject lens</strong>: {accuracyCoach.subject_context || "—"} · <strong>Exam lens</strong>:{" "}
                        {accuracyCoach.exam_context || "—"}
                      </p>
                      {accuracyCoach.build_items.length > 0 ? (
                        <ul className="strategy-build-list">
                          {accuracyCoach.build_items.map((it, idx) => {
                            const st = accuracyCategoryStyle(it.category);
                            return (
                              <li
                                key={`${it.title}-${idx}`}
                                className="strategy-build-item"
                                style={{ background: st.bg, borderColor: "rgba(148, 163, 184, 0.45)" }}
                              >
                                <div className="strategy-build-item__head">
                                  <span style={{ fontWeight: 700, color: "var(--text)" }}>{it.title}</span>
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      fontWeight: 700,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.03em",
                                      color: st.fg,
                                    }}
                                  >
                                    {st.label}
                                  </span>
                                  {it.question_indices?.length ? (
                                    <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Q {it.question_indices.join(", ")}</span>
                                  ) : null}
                                </div>
                                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text)", whiteSpace: "pre-wrap" }}>{it.what_to_build}</p>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      {accuracyCoach.practice_drills?.length ? (
                        <div className="strategy-drills">
                          <div className="label" style={{ fontSize: "0.72rem", marginBottom: "0.25rem" }}>
                            Practice drills
                          </div>
                          <ul>
                            {accuracyCoach.practice_drills.map((d, i) => (
                              <li key={`${i}-${d.slice(0, 24)}`}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                </div>

                <div className="strategy-column">
                  <h5 className="strategy-column__title">Time &amp; pacing coach</h5>
                  <div className="strategy-column__chart">
                    <RunningMetricTwinLinesChart
                      chartKey={detail.attempt_id}
                      variant="time"
                      n={series.n}
                      actual={series.timeActual}
                      strategy={series.timeStrategy}
                      yAxisLabel="Cumulative time"
                      yMin={0}
                      yMax={timeYMax}
                      formatTick={formatSecondsAxis}
                      ariaLabel={`Cumulative time and AI coach for attempt ${detail.attempt_id}`}
                      legendActual="Actual cumulative time"
                      legendStrategy="Heuristic strategy-adjusted time (illustrative)"
                      aiOptimal={timeCoach?.used_openai && coachAiAligned?.length === series.n ? coachAiAligned : null}
                      aiOptimalLegend="Optimal cumulative time"
                      skipAtIndices={coachSkipAt}
                      deferAtIndices={coachDeferAt}
                      capAtIndices={coachCapAt}
                    />
                  </div>
                  <div className="strategy-column__body">
                  {loadingTimeCoach ? <p className="strategy-status">Loading AI time coach…</p> : null}
                  {!loadingTimeCoach && timeCoach && !timeCoach.openai_configured ? (
                    <p className="strategy-status">OpenAI is not configured — only the heuristic pacing curve (blue) is shown.</p>
                  ) : null}
                  {!loadingTimeCoach && timeCoach?.openai_configured && timeCoach.error ? (
                    <p className="strategy-status strategy-status--warn">AI coach: {timeCoach.error}</p>
                  ) : null}
                  {timeCoach?.used_openai && timeCoach.summary ? (
                    <div className="strategy-coach-panel">
                      <p>
                        <strong>Adaptest AI time plan</strong> — {timeCoach.summary}
                      </p>
                    </div>
                  ) : null}
                  {timeCoach?.used_openai && timeCoach.risks_overview ? (
                    <div className="strategy-coach-panel strategy-coach-panel--detail">
                      <p style={{ color: "var(--muted)" }}>
                        <strong>Risks</strong> — {timeCoach.risks_overview}
                      </p>
                    </div>
                  ) : null}
                  {timeCoach?.used_openai && coachPerQuestionHighlights.length > 0 ? (
                    <div className="strategy-time-notes">
                      <div className="label" style={{ fontSize: "0.72rem", marginBottom: "0.3rem" }}>
                        Pacing notes (skip / cap / defer)
                      </div>
                      <ul>
                        {coachPerQuestionHighlights.slice(0, 12).map((p) => (
                          <li key={p.index}>
                            <strong>Q{p.index}</strong> · {p.time_action.replace(/_/g, " ")} · risk {p.risk_level}
                            {p.hint ? ` — ${p.hint}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {strategyInsights ? <StrategyFootnoteVisual insights={strategyInsights} /> : null}
        </>
      ) : null}

      {!loading && detail && !bubbleSteps.length ? <p className="strategy-status">This attempt has no per-question data yet.</p> : null}
    </article>
  );
}
