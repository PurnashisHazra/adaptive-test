import type { StudentCoachPlanBundle } from "../api/types";

/** [soft, strong] seconds on this question — drives live urgency vs difficulty. */
const DIFF_THRESHOLDS: Record<string, [number, number]> = {
  EASY: [18, 40],
  MEDIUM: [28, 52],
  HARD: [22, 45],
  EXPERT: [16, 34],
};

const TIME_ACTION_GUIDE: Record<string, string> = {
  full_attempt: "Give this item a full, careful attempt if a solution path is visible.",
  time_cap: "Cap time here: decide and commit before over-investing—other marks still count.",
  defer_revisit: "If stuck, mark for review and move on; revisit after easier questions are done.",
  skip_if_behind: "If you are behind schedule, skip for now and secure easier marks first—revisit at the end.",
};

function tier(difficulty?: string | null): string {
  const x = (difficulty || "MEDIUM").toUpperCase();
  return DIFF_THRESHOLDS[x] ? x : "MEDIUM";
}

function sliceText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type PerQ = {
  index?: number;
  time_action?: string;
  risk_level?: string;
  hint?: string;
};

function perQuestionRow(plan: StudentCoachPlanBundle | null, currentIndex: number): PerQ | null {
  const raw = plan?.time_plan?.per_question;
  if (!Array.isArray(raw)) return null;
  const rows = raw as PerQ[];
  const byExact = rows.find((p) => Number(p?.index) === currentIndex);
  if (byExact) return byExact;
  if (currentIndex >= 1) {
    const zeroBased = rows.find((p) => Number(p?.index) === currentIndex - 1);
    if (zeroBased) return zeroBased;
  }
  return null;
}

function cumulativeBehind(
  plan: StudentCoachPlanBundle | null,
  currentIndex: number,
  testElapsedSeconds: number,
): boolean {
  const raw = plan?.time_plan?.cumulative_optimal_seconds;
  if (!Array.isArray(raw) || currentIndex < 2) return false;
  const i = currentIndex - 2;
  if (i < 0 || i >= raw.length) return false;
  const target = Number(raw[i]);
  if (!Number.isFinite(target) || target < 0) return false;
  const slack = Math.max(45, target * 0.15);
  return testElapsedSeconds > target + slack;
}

type BuildItem = {
  category?: string;
  title?: string;
  what_to_build?: string;
  question_indices?: number[];
};

/** Current on-screen question — used to pick accuracy tips; indices in saved plans refer to older attempts. */
export type CurrentQuestionContext = {
  index: number;
  subject: string;
  topic: string;
  stem: string;
};

function parseBuildItems(plan: StudentCoachPlanBundle | null): BuildItem[] {
  const raw = plan?.accuracy_plan?.build_items;
  if (!Array.isArray(raw)) return [];
  return raw as BuildItem[];
}

function itemTextBlob(item: BuildItem): string {
  return `${item.title || ""} ${item.what_to_build || ""}`.toLowerCase();
}

/** Saved plans index a past attempt; overlap with this question's topic/stem is the reliable signal. */
function contentRelevanceScore(item: BuildItem, ctx: CurrentQuestionContext): number {
  const blob = itemTextBlob(item);
  let s = 0;
  const topic = ctx.topic.toLowerCase().trim();
  const subj = ctx.subject.toLowerCase().trim();
  if (topic && topic !== "general" && blob.includes(topic)) s += 14;
  if (subj && subj !== "general" && blob.includes(subj)) s += 10;
  const titleLc = (item.title || "").toLowerCase();
  const stemTokens = ctx.stem
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 5 && w.length <= 24);
  const seen = new Set<string>();
  for (const w of stemTokens) {
    if (seen.has(w)) continue;
    seen.add(w);
    if (blob.includes(w)) s += 1.5;
    if (titleLc.includes(w)) s += 2.5;
  }
  return Math.min(s, 40);
}

/**
 * Weak tie-break: indices in persisted plans refer to the attempt used to build the plan, not necessarily
 * this session's questions. Still reward exact / adjacent / 0-based matches when the model aligns them.
 */
function indexHintScore(qi: number[] | undefined, currentIndex: number): number {
  if (!Array.isArray(qi) || qi.length === 0) return 0;
  const nums = qi.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;
  if (nums.some((n) => n === currentIndex)) return 7;
  if (currentIndex >= 1 && nums.some((n) => n === currentIndex - 1)) return 5;
  const dist = Math.min(...nums.map((n) => Math.abs(n - currentIndex)));
  if (dist <= 1) return 1;
  return 0;
}

function rankBuildItemsForCurrentQuestion(items: BuildItem[], ctx: CurrentQuestionContext): BuildItem[] {
  if (items.length === 0) return [];
  const scored = items.map((item, origIdx) => {
    const overlap = contentRelevanceScore(item, ctx);
    const idxPart = indexHintScore(item.question_indices, ctx.index);
    const general = !item.question_indices || item.question_indices.length === 0 ? 1.5 : 0;
    return { item, score: overlap + idxPart + general, origIdx };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.origIdx - b.origIdx;
  });
  return scored.map((x) => x.item);
}

function pickRankedByCategoryOrder(ranked: BuildItem[], categories: string[]): BuildItem | undefined {
  for (const c of categories) {
    const hit = ranked.find((i) => (i.category || "").toLowerCase() === c);
    if (hit) return hit;
  }
  return ranked[0];
}

function formatBuildLine(item: BuildItem, maxBody: number): string | undefined {
  const w = item.what_to_build;
  if (typeof w !== "string" || !w.trim()) return undefined;
  const title = typeof item.title === "string" && item.title.trim() ? `${item.title}: ` : "";
  return `${title}${sliceText(w, maxBody)}`.trim();
}

function buildSecondary(
  plan: StudentCoachPlanBundle | null,
  ctx: CurrentQuestionContext,
  questionType: string,
  secondsOnQuestion: number,
  tSoft: number,
): string | undefined {
  const items = parseBuildItems(plan);
  if (items.length === 0) return undefined;
  const ranked = rankBuildItemsForCurrentQuestion(items, ctx);

  if (questionType === "tita" && secondsOnQuestion >= tSoft + 8) {
    const pick = pickRankedByCategoryOrder(ranked, ["formula", "trick", "mixed", "concept", "deep_knowledge"]);
    return pick ? formatBuildLine(pick, 220) : undefined;
  }
  const conceptPick = pickRankedByCategoryOrder(ranked, ["concept", "mixed", "trick", "formula", "deep_knowledge"]);
  return conceptPick ? formatBuildLine(conceptPick, 200) : undefined;
}

export type CoachUrgency = "ok" | "notice" | "warn" | "urgent";

export interface CoachLiveAdvice {
  urgency: CoachUrgency;
  headline: string;
  strategyLine: string;
  secondaryLine?: string;
  secondsOnQuestion: number;
  /** Short label for the saved time action when known */
  actionLabel?: string;
}

/**
 * Real-time coach copy for the adaptive test UI (recomputed every tick; no toast state).
 */
export function computeCoachLiveAdvice(input: {
  secondsOnQuestion: number;
  currentIndex: number;
  totalQuestions: number;
  testElapsedSeconds: number;
  difficulty?: string | null;
  questionType: string;
  plan: StudentCoachPlanBundle | null;
  /** When set, concept / formula lines are chosen for this question (not only plan indices). */
  questionSubject?: string;
  questionTopic?: string;
  questionStem?: string;
}): CoachLiveAdvice {
  const {
    secondsOnQuestion,
    currentIndex,
    totalQuestions,
    testElapsedSeconds,
    difficulty,
    questionType,
    plan,
    questionSubject = "",
    questionTopic = "",
    questionStem = "",
  } = input;
  const [tSoft, tStrong] = DIFF_THRESHOLDS[tier(difficulty)];
  const diffU = tier(difficulty);
  const isHard = diffU === "HARD" || diffU === "EXPERT";

  const timePlan = plan?.time_plan as { summary?: unknown; risks_overview?: unknown } | undefined;
  const summary = typeof timePlan?.summary === "string" ? timePlan.summary.trim() : "";
  const risks = typeof timePlan?.risks_overview === "string" ? timePlan.risks_overview.trim() : "";

  const pq = perQuestionRow(plan, currentIndex);
  const action = (pq?.time_action || "full_attempt").toLowerCase();
  const risk = (pq?.risk_level || "low").toLowerCase();
  const pqHint = typeof pq?.hint === "string" ? pq.hint.trim() : "";

  const behind = cumulativeBehind(plan, currentIndex, testElapsedSeconds);
  const skipMode = action === "skip_if_behind" || action === "defer_revisit";

  let urgencyScore = 0;
  if (secondsOnQuestion >= tStrong) urgencyScore = isHard ? 3 : 2;
  else if (secondsOnQuestion >= tSoft) urgencyScore = 2;
  else if (secondsOnQuestion >= tSoft * 0.55) urgencyScore = 1;
  if (risk === "high") urgencyScore = Math.max(urgencyScore, 2);
  else if (risk === "medium") urgencyScore = Math.max(urgencyScore, 1);
  if (behind) urgencyScore = Math.min(3, urgencyScore + 1);
  if (skipMode && behind) urgencyScore = Math.min(3, urgencyScore + 1);

  const urgency: CoachUrgency = urgencyScore >= 3 ? "urgent" : urgencyScore === 2 ? "warn" : urgencyScore === 1 ? "notice" : "ok";

  const actionGuide = TIME_ACTION_GUIDE[action] || TIME_ACTION_GUIDE.full_attempt;
  let strategyLine = pqHint || actionGuide;
  if (summary && !pqHint && urgency === "ok") {
    strategyLine = sliceText(summary, 280);
  }

  const parts: string[] = [];
  if (behind) {
    parts.push("You are past the cumulative pace from your saved time plan—prioritise faster decisions on this item.");
  }
  if (secondsOnQuestion >= tSoft && secondsOnQuestion < tStrong) {
    parts.push(`About ${secondsOnQuestion}s on this question—stay decisive.`);
  }
  if (secondsOnQuestion >= tStrong) {
    if (isHard) {
      parts.push(sliceText(risks, 200) || "Consider marking for review and moving on so the rest of the test stays on track.");
    } else {
      parts.push("Time is stacking on this item—commit or change approach.");
    }
  }
  if (skipMode && secondsOnQuestion >= tSoft * 0.45) {
    parts.push("Your saved plan prefers lighter commitment here—avoid grinding if progress stalls.");
  }
  if (parts.length) {
    strategyLine = `${strategyLine} ${parts.join(" ")}`.trim();
  }

  const headline =
    urgency === "urgent"
      ? "Act on your plan now"
      : urgency === "warn"
        ? "Adjust to your strategy"
        : urgency === "notice"
          ? "Check pace"
          : `Question ${currentIndex} of ${totalQuestions}`;

  const qctx: CurrentQuestionContext = {
    index: currentIndex,
    subject: questionSubject,
    topic: questionTopic,
    stem: questionStem,
  };
  const secondary = buildSecondary(plan, qctx, questionType, secondsOnQuestion, tSoft);

  const actionLabel =
    action === "full_attempt"
      ? "Full attempt"
      : action === "time_cap"
        ? "Time cap"
        : action === "defer_revisit"
          ? "Defer / revisit"
          : action === "skip_if_behind"
            ? "Skip if behind"
            : undefined;

  return {
    urgency,
    headline,
    strategyLine: sliceText(strategyLine, 420),
    secondaryLine: secondary,
    secondsOnQuestion,
    actionLabel,
  };
}
