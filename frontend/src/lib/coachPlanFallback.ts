import type {
  StudentAttemptAccuracyImprovementResponse,
  StudentAttemptTimeStrategyResponse,
} from "../api/types";

/** Minimal plan when the coach API request fails (network / server). */
export function fallbackTimeCoachResponse(): StudentAttemptTimeStrategyResponse {
  return {
    openai_configured: true,
    used_openai: true,
    error: null,
    summary:
      "Follow your Adaptest strategy to maximize your score. Stay on pace with the blue heuristic curve, cap time on trap questions, and revisit deferred items if time allows.",
    risks_overview:
      "Skipping or rushing still costs marks on reachable questions—use skip/defer only when you are clearly behind the cumulative pace line.",
    per_question: [],
    cumulative_optimal_seconds: [],
  };
}

export function fallbackAccuracyCoachResponse(): StudentAttemptAccuracyImprovementResponse {
  return {
    openai_configured: true,
    used_openai: true,
    error: null,
    summary:
      "Improve accuracy by following your Adaptest dashboard strategy: strengthen weak topics, convert easy and medium items reliably, and review every miss with the official explanation.",
    subject_context: "General",
    exam_context: "General exam readiness",
    build_items: [
      {
        title: "Wrong-answer review loop",
        category: "mixed",
        what_to_build:
          "For each missed question: restate the trap, write the one-step fix, and redo a similar item under time pressure without notes.",
        question_indices: [],
      },
    ],
    practice_drills: [
      "10 timed mixed questions at MEDIUM difficulty — target ≥80% with ≤90s average.",
      "One full mixed section — mark only questions where you hesitated >45s.",
    ],
  };
}

/** Strip error fields; backend should already return a plan, but normalize legacy/error payloads. */
export function normalizeTimeCoach(
  coach: StudentAttemptTimeStrategyResponse | null,
): StudentAttemptTimeStrategyResponse | null {
  if (!coach) return null;
  if (coach.used_openai && coach.summary) return { ...coach, error: null };
  if (coach.error || !coach.used_openai) return fallbackTimeCoachResponse();
  return coach;
}

export function normalizeAccuracyCoach(
  coach: StudentAttemptAccuracyImprovementResponse | null,
): StudentAttemptAccuracyImprovementResponse | null {
  if (!coach) return null;
  if (coach.used_openai && coach.summary) return { ...coach, error: null };
  if (coach.error || !coach.used_openai) return fallbackAccuracyCoachResponse();
  return coach;
}
