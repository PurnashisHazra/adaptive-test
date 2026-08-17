import type { StudentOverallAnalytics, StudentOverallDimensionKey, StudentQuestionReview } from "../api/types";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function dimStrength(overall: StudentOverallAnalytics, key: StudentOverallDimensionKey): number {
  return overall.dimensions.find((x) => x.key === key)?.overall_strength ?? 55;
}

/** Average normalized gap (0–1) between your blended strengths and the dashboard target. */
export function strategyBlendGap(overall: StudentOverallAnalytics | null): number {
  if (!overall?.desired_state) return 0.12;
  const ds = overall.desired_state;
  const gaps = [
    Math.max(0, ds.knowledge_strength - dimStrength(overall, "knowledge")),
    Math.max(0, ds.difficulty_strength - dimStrength(overall, "difficulty")),
    Math.max(0, ds.time_strength - dimStrength(overall, "time")),
  ];
  return clamp((gaps[0] + gaps[1] + gaps[2]) / 300, 0, 0.45);
}

/** Gap on the time axis only (0–1), used for pacing counterfactual. */
export function timeStrengthGap(overall: StudentOverallAnalytics | null): number {
  if (!overall?.desired_state) return 0.1;
  const g = Math.max(0, overall.desired_state.time_strength - dimStrength(overall, "time"));
  return clamp(g / 100, 0, 0.4);
}

function strategyAdjustedQuestionSeconds(q: StudentQuestionReview, blendGap: number, timeGap: number): number {
  const t = Math.max(0, q.time_spent_seconds ?? 0);
  if (t <= 0) return 0;
  let factor = 1;
  const peerT = q.peer_avg_time_seconds;
  if (peerT != null && peerT > 0 && t > peerT * 1.35) {
    const over = clamp((t - peerT * 1.35) / Math.max(peerT, 1), 0, 4);
    factor -= (0.1 * timeGap + 0.06 * blendGap) * over;
  }
  for (const c of q.insight_capsules ?? []) {
    if (c.key === "wasted_time") factor -= 0.16 + 0.14 * timeGap;
    if (c.key === "skip_revisit") factor -= 0.05 + 0.04 * timeGap;
  }
  return t * clamp(factor, 0.42, 1);
}

function recoveryForWrong(q: StudentQuestionReview, blendGap: number): number {
  const peer = clamp((q.peer_accuracy_percent ?? 62) / 100, 0.32, 0.98);
  let capsule = 0;
  for (const c of q.insight_capsules ?? []) {
    if (c.key === "missed_opportunity") capsule += 0.07;
    if (c.key === "wasted_time") capsule += 0.05;
    if (c.key === "skip_revisit") capsule += 0.04;
  }
  const base = 0.04 + blendGap * 0.52;
  const peerLift = blendGap * peer * 0.38;
  return clamp(base + peerLift + capsule, 0, 0.92);
}

export function orderedQuestions(questions: StudentQuestionReview[]): StudentQuestionReview[] {
  return [...questions].sort((a, b) => a.index - b.index);
}

/** Running accuracy (%) after each question: actual vs illustrative strategy-following path. */
export function computeRunningAccuracySeries(questions: StudentQuestionReview[], overall: StudentOverallAnalytics | null) {
  const ordered = orderedQuestions(questions);
  const n = ordered.length;
  const actual: number[] = [];
  const strategy: number[] = [];
  const blendGap = strategyBlendGap(overall);
  let correct = 0;
  let stratSum = 0;
  let attemptedCount = 0;

  for (let i = 0; i < n; i++) {
    const q = ordered[i];
    if (q.is_attempted === false) {
      actual.push(attemptedCount > 0 ? (correct / attemptedCount) * 100 : 0);
      strategy.push(attemptedCount > 0 ? Math.min(100, (stratSum / attemptedCount) * 100) : 0);
      continue;
    }
    attemptedCount += 1;
    if (q.is_correct) {
      correct += 1;
      stratSum += 1;
    } else {
      stratSum += recoveryForWrong(q, blendGap);
    }
    actual.push((correct / attemptedCount) * 100);
    strategy.push(Math.min(100, (stratSum / attemptedCount) * 100));
  }

  const wrongWithPeer = ordered.filter((q) => q.is_attempted !== false && !q.is_correct && q.peer_accuracy_percent != null).length;
  const missedFlags = ordered.filter(
    (q) => q.is_attempted !== false && !q.is_correct && q.insight_capsules?.some((c) => c.key === "missed_opportunity")
  ).length;

  const timeGap = timeStrengthGap(overall);
  const timeActual: number[] = [];
  const timeStrategy: number[] = [];
  let cumTimeA = 0;
  let cumTimeS = 0;
  for (let i = 0; i < n; i++) {
    const q = ordered[i];
    cumTimeA += Math.max(0, q.time_spent_seconds ?? 0);
    cumTimeS += strategyAdjustedQuestionSeconds(q, blendGap, timeGap);
    timeActual.push(cumTimeA);
    timeStrategy.push(cumTimeS);
  }
  const wastedTimeFlags = ordered.filter((q) => q.insight_capsules?.some((c) => c.key === "wasted_time")).length;

  const timeBehindStrengthPoints =
    overall != null ? Math.round(Math.max(0, overall.desired_state.time_strength - dimStrength(overall, "time"))) : 0;

  return {
    actual,
    strategy,
    timeActual,
    timeStrategy,
    timeGap,
    timeBehindStrengthPoints,
    ordered,
    blendGap,
    wrongWithPeer,
    missedFlags,
    wastedTimeFlags,
    n,
  };
}

export type StrategyInsightCardTone = "accent" | "time" | "warn" | "neutral";

export interface StrategyInsightCard {
  id: string;
  title: string;
  body: string;
  tone: StrategyInsightCardTone;
  metric?: string;
}

export interface StrategyInsightDonutSegment {
  value: number;
  color: string;
  label: string;
}

export interface StrategyInsightDonut {
  id: string;
  title: string;
  caption: string;
  centerLabel: string;
  centerSub?: string;
  segments: StrategyInsightDonutSegment[];
}

export interface StrategyCounterfactualInsights {
  lead: string;
  donuts: StrategyInsightDonut[];
  cards: StrategyInsightCard[];
}

function averageProfileStrength(overall: StudentOverallAnalytics): number {
  if (!overall.dimensions.length) return 55;
  return overall.dimensions.reduce((s, d) => s + d.overall_strength, 0) / overall.dimensions.length;
}

function averageDesiredStrength(overall: StudentOverallAnalytics): number {
  const ds = overall.desired_state;
  return (ds.knowledge_strength + ds.difficulty_strength + ds.time_strength) / 3;
}

function formatDurationShort(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) return `${(s / 3600).toFixed(1)}h`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

/** Structured lift summary for donut charts and suggestion cards (replaces plain footnote text). */
export function buildStrategyCounterfactualInsights(
  overall: StudentOverallAnalytics | null,
  series: ReturnType<typeof computeRunningAccuracySeries>,
): StrategyCounterfactualInsights | null {
  const { blendGap, timeBehindStrengthPoints, n, wrongWithPeer, missedFlags, wastedTimeFlags } = series;
  if (n <= 0) return null;

  const actualAcc = series.actual[n - 1] ?? 0;
  const strategyAcc = series.strategy[n - 1] ?? 0;
  const accLift = Math.max(0, strategyAcc - actualAcc);
  const actualTime = series.timeActual[n - 1] ?? 0;
  const strategyTime = series.timeStrategy[n - 1] ?? 0;
  const timeSaved = Math.max(0, actualTime - strategyTime);
  const gapPct = Math.round(blendGap * 100);
  const wrongCount = series.ordered.filter((q) => !q.is_correct).length;

  const profileCurrent = overall ? Math.round(averageProfileStrength(overall)) : null;
  const profileTarget = overall ? Math.round(averageDesiredStrength(overall)) : null;
  const profileGap = profileCurrent != null && profileTarget != null ? Math.max(0, profileTarget - profileCurrent) : gapPct;

  const donuts: StrategyInsightDonut[] = [
    {
      id: "accuracy",
      title: "Accuracy lift",
      caption: "Green = your final running %; blue = illustrative lift if strategy habits converted on misses.",
      centerLabel: `${Math.round(actualAcc)}%`,
      centerSub: accLift >= 0.5 ? `+${accLift.toFixed(1)} pts` : "on pace",
      segments: [
        { value: Math.max(0.1, actualAcc), color: "#16a34a", label: "Actual" },
        ...(accLift >= 0.5 ? [{ value: accLift, color: "#2563eb", label: "Illustrative lift" }] : []),
        ...(actualAcc + accLift < 100 ? [{ value: 100 - actualAcc - accLift, color: "#e2e8f0", label: "Remaining headroom" }] : []),
      ],
    },
    {
      id: "profile",
      title: "Profile vs target",
      caption:
        overall == null
          ? "Loads with your radar — gap scales how much each miss could recover under the habits below."
          : `Blended strength vs radar target; ~${gapPct}% average gap scales the blue accuracy curve.`,
      centerLabel: profileCurrent != null ? `${profileCurrent}` : "—",
      centerSub: profileGap > 0 ? `${profileGap} pts to target` : "at target",
      segments:
        profileCurrent != null
          ? [
              { value: Math.max(0.1, profileCurrent), color: "#0ea5e9", label: "Current strength" },
              { value: Math.max(0.1, profileGap), color: "#cbd5e1", label: "Gap to target" },
              ...(profileCurrent + profileGap < 100
                ? [{ value: 100 - profileCurrent - profileGap, color: "#f1f5f9", label: "Headroom" }]
                : []),
            ]
          : [{ value: 55, color: "#94a3b8", label: "Loading" }, { value: 45, color: "#e2e8f0", label: "Target gap" }],
    },
    {
      id: "time",
      title: "Cumulative time",
      caption: "Purple = illustrative pacing path; green = recoverable time vs your actual cumulative clock.",
      centerLabel: formatDurationShort(actualTime),
      centerSub: timeSaved >= 3 ? `−${formatDurationShort(timeSaved)}` : "tight pacing",
      segments:
        timeSaved >= 3
          ? [
              { value: Math.max(1, strategyTime), color: "#7c3aed", label: "Strategy path" },
              { value: timeSaved, color: "#22c55e", label: "Recoverable" },
            ]
          : [
              { value: Math.max(1, actualTime), color: "#7c3aed", label: "Actual cumulative" },
              { value: 1, color: "#e2e8f0", label: "Minimal trim" },
            ],
    },
  ];

  if (wrongCount > 0 || missedFlags > 0 || wastedTimeFlags > 0) {
    const otherWrong = Math.max(0, wrongCount - missedFlags - wastedTimeFlags);
    donuts.push({
      id: "signals",
      title: "Attempt signals",
      caption: "Share of graded items with insight flags (some items can carry more than one).",
      centerLabel: `${n}`,
      centerSub: "questions",
      segments: [
        { value: Math.max(0, n - wrongCount), color: "#16a34a", label: "Correct" },
        ...(missedFlags > 0 ? [{ value: missedFlags, color: "#ea580c", label: "Missed opportunity" }] : []),
        ...(wastedTimeFlags > 0 ? [{ value: wastedTimeFlags, color: "#dc2626", label: "Wasted time" }] : []),
        ...(otherWrong > 0 ? [{ value: otherWrong, color: "#94a3b8", label: "Other misses" }] : []),
      ],
    });
  }

  const cards: StrategyInsightCard[] = [];

  if (overall?.strategy_to_desired_state?.length) {
    overall.strategy_to_desired_state.slice(0, 5).forEach((line, i) => {
      cards.push({
        id: `profile-strategy-${i}`,
        title: i === 0 ? "Top priority" : `Focus ${i + 1}`,
        body: line,
        tone: i === 0 ? "accent" : "neutral",
      });
    });
  }

  if (accLift >= 1) {
    cards.push({
      id: "acc-lift",
      title: "Accuracy headroom",
      metric: `+${accLift.toFixed(1)}%`,
      body: "The dashed blue path adds fractional credit on misses — higher when peers usually solve the item and when missed-opportunity insights fired.",
      tone: "accent",
    });
  }

  if (timeBehindStrengthPoints > 0) {
    cards.push({
      id: "time-strength",
      title: "Time management gap",
      metric: `${timeBehindStrengthPoints} pts`,
      body: "You are below the radar time target; the purple optimal curve and pacing notes scale trims from this gap.",
      tone: "time",
    });
  }

  if (timeSaved >= 5) {
    cards.push({
      id: "time-saved",
      title: "Recoverable clock",
      metric: formatDurationShort(timeSaved),
      body: "Illustrative cumulative time if slow outliers and wasted-time / skip-revisit signals were addressed — not a stopwatch forecast.",
      tone: "time",
    });
  }

  if (wrongWithPeer > 0) {
    cards.push({
      id: "peer-misses",
      title: "Peer-backed misses",
      metric: `${wrongWithPeer}`,
      body: "Incorrect items where cohort accuracy was available — lifts on the blue curve weigh these higher.",
      tone: "warn",
    });
  }

  if (missedFlags > 0) {
    cards.push({
      id: "missed-opp",
      title: "Missed opportunity",
      metric: `${missedFlags}`,
      body: "Insights flagged items where a strategy habit (faster attempt, revisit, or concept refresh) could have flipped the outcome.",
      tone: "warn",
    });
  }

  if (wastedTimeFlags > 0) {
    cards.push({
      id: "wasted-time",
      title: "Wasted time",
      metric: `${wastedTimeFlags}`,
      body: "Items where time spent was high vs peers without a payoff — strongest driver of the green recoverable slice on the time donut.",
      tone: "warn",
    });
  }

  if (!cards.length) {
    cards.push({
      id: "baseline",
      title: "Keep building signal",
      body: `This attempt has ${n} graded questions. As more attempts populate your radar, strategy cards and lift curves will sharpen.`,
      tone: "neutral",
    });
  }

  const lead =
    overall == null
      ? "Illustrative lift from your attempt vs dashboard habits — not a score prediction."
      : `Based on ${n} questions in this attempt and your filtered performance profile. Dashed curves show room on the table if listed habits converted.`;

  return { lead, donuts, cards: cards.slice(0, 8) };
}
