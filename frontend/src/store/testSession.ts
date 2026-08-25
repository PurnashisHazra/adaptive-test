import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  AttemptSessionFilters,
  AttemptSummary,
  PaperNextSection,
  PaperResultSummary,
  PaperSessionMeta,
  QuestionStudent,
  TestStartResponse,
} from "../api/types";

interface TestSessionState {
  attemptId: string | null;
  studentName: string;
  totalQuestions: number;
  currentIndex: number;
  question: QuestionStudent | null;
  timeLimitSeconds: number | null;
  startedAt: string | null;
  lastSummary: AttemptSummary | null;
  lastPaperSummary: PaperResultSummary | null;
  questionsAnswered: number;
  maxReachableIndex: number;
  markedForReview: number[];
  canSubmit: boolean;
  adaptiveDisabled: boolean;
  answeredIndices: number[];
  paperAttemptId: string | null;
  paperMeta: PaperSessionMeta | null;
  /** Multi-section session source: question paper vs scheduled challenge. */
  structuredKind: "paper" | "challenge" | null;
  sectionStartedAt: string | null;
  /** Subject/topic/exam lens for this attempt (from server). Used for coach plan lookup. */
  attemptFilters: AttemptSessionFilters | null;
  pendingStart:
    | {
        studentName: string;
        subject?: string;
        topic?: string;
        exam_tag?: string;
        totalQuestions: number;
        timeLimitSeconds?: number | null;
      }
    | null;
  reset: () => void;
  hydrateStart: (p: {
    attemptId: string;
    studentName: string;
    totalQuestions: number;
    question: QuestionStudent;
    questionIndex: number;
    timeLimitSeconds?: number | null;
    startedAt: string;
    markedForReview?: number[];
    questionsAnswered?: number;
    maxReachableIndex?: number;
    attemptFilters?: AttemptSessionFilters | null;
  }) => void;
  hydratePaperStart: (res: TestStartResponse, studentName: string, kind?: "paper" | "challenge") => void;
  applyPaperNext: (res: PaperNextSection) => void;
  applyNavigate: (p: {
    question: QuestionStudent;
    questionIndex: number;
    questionsAnswered: number;
    maxReachableIndex: number;
    markedForReview: number[];
    canSubmit: boolean;
    adaptiveDisabled?: boolean;
    answeredIndices?: number[];
  }) => void;
  setAfterSubmit: (p: {
    nextQuestion: QuestionStudent | null;
    questionIndex: number | null;
    summary: AttemptSummary | null;
    markedForReview?: number[];
    questionsAnswered?: number;
    maxReachableIndex?: number;
    adaptiveDisabled?: boolean;
    answeredIndices?: number[];
  }) => void;
  setLastPaperSummary: (s: PaperResultSummary | null) => void;
  setMarkedForReview: (indices: number[]) => void;
  setPendingStart: (p: {
    studentName: string;
    subject?: string;
    topic?: string;
    exam_tag?: string;
    totalQuestions: number;
    timeLimitSeconds?: number | null;
  }) => void;
  clearPendingStart: () => void;
}

const paperClear = {
  paperAttemptId: null as string | null,
  paperMeta: null as PaperSessionMeta | null,
  structuredKind: null as "paper" | "challenge" | null,
  sectionStartedAt: null as string | null,
  lastPaperSummary: null as PaperResultSummary | null,
};

export const useTestSession = create<TestSessionState>()(
  persist(
    (set) => ({
      attemptId: null,
      studentName: "",
      totalQuestions: 10,
      currentIndex: 1,
      question: null,
      timeLimitSeconds: null,
      startedAt: null,
      lastSummary: null,
      lastPaperSummary: null,
      questionsAnswered: 0,
      maxReachableIndex: 1,
      markedForReview: [],
      canSubmit: true,
      adaptiveDisabled: false,
      answeredIndices: [],
      paperAttemptId: null,
      paperMeta: null,
      structuredKind: null,
      sectionStartedAt: null,
      pendingStart: null,
      attemptFilters: null as AttemptSessionFilters | null,
      reset: () =>
        set({
          attemptId: null,
          studentName: "",
          totalQuestions: 10,
          currentIndex: 1,
          question: null,
          timeLimitSeconds: null,
          startedAt: null,
          lastSummary: null,
          questionsAnswered: 0,
          maxReachableIndex: 1,
          markedForReview: [],
          canSubmit: true,
          adaptiveDisabled: false,
          answeredIndices: [],
          pendingStart: null,
          attemptFilters: null,
          ...paperClear,
        }),
      hydrateStart: (p) =>
        set({
          attemptId: p.attemptId,
          studentName: p.studentName,
          totalQuestions: p.totalQuestions,
          question: p.question,
          currentIndex: p.questionIndex,
          timeLimitSeconds: p.timeLimitSeconds ?? null,
          startedAt: p.startedAt,
          lastSummary: null,
          questionsAnswered: p.questionsAnswered ?? 0,
          maxReachableIndex: p.maxReachableIndex ?? 1,
          markedForReview: p.markedForReview ?? [],
          canSubmit: true,
          adaptiveDisabled: false,
          answeredIndices: [],
          attemptFilters: p.attemptFilters ?? null,
          ...paperClear,
        }),
      hydratePaperStart: (res, studentName, kind = "paper") => {
        if (!res.paper) {
          throw new Error("Missing paper metadata");
        }
        set({
          attemptId: res.attempt_id,
          studentName,
          totalQuestions: res.total_questions,
          question: res.question,
          currentIndex: res.question_index,
          timeLimitSeconds: res.time_limit_seconds ?? null,
          startedAt: res.started_at,
          questionsAnswered: res.questions_answered ?? 0,
          maxReachableIndex: res.max_reachable_index ?? 1,
          markedForReview: res.marked_for_review ?? [],
          canSubmit: res.can_submit !== false,
          adaptiveDisabled: Boolean(res.adaptive_disabled),
          answeredIndices: res.answered_indices ?? [],
          lastSummary: null,
          paperAttemptId: res.paper.paper_attempt_id,
          paperMeta: res.paper,
          structuredKind: kind,
          sectionStartedAt: res.started_at,
          lastPaperSummary: null,
          attemptFilters: res.attempt_filters ?? null,
        });
      },
      applyPaperNext: (res) =>
        set({
          attemptId: res.attempt_id,
          question: res.question,
          currentIndex: res.question_index,
          totalQuestions: res.total_questions,
          timeLimitSeconds: res.time_limit_seconds ?? null,
          questionsAnswered: res.questions_answered,
          maxReachableIndex: res.max_reachable_index,
          markedForReview: res.marked_for_review,
          canSubmit: true,
          adaptiveDisabled: Boolean(res.adaptive_disabled),
          answeredIndices: res.answered_indices ?? [],
          paperMeta: res.paper,
          paperAttemptId: res.paper.paper_attempt_id,
          sectionStartedAt: new Date().toISOString(),
          attemptFilters: null,
        }),
      applyNavigate: (p) =>
        set((s) => ({
          question: p.question,
          currentIndex: p.questionIndex,
          questionsAnswered: p.questionsAnswered,
          maxReachableIndex: p.maxReachableIndex,
          markedForReview: p.markedForReview,
          canSubmit: p.canSubmit,
          adaptiveDisabled: p.adaptiveDisabled ?? s.adaptiveDisabled,
          answeredIndices: p.answeredIndices ?? s.answeredIndices,
        })),
      setAfterSubmit: (p) =>
        set((s) => ({
          question: p.nextQuestion,
          currentIndex: p.questionIndex ?? s.currentIndex,
          lastSummary: p.summary ?? s.lastSummary,
          questionsAnswered: p.questionsAnswered ?? s.questionsAnswered,
          maxReachableIndex: p.maxReachableIndex ?? s.maxReachableIndex,
          markedForReview: p.markedForReview ?? s.markedForReview,
          canSubmit: p.nextQuestion != null ? true : s.canSubmit,
          adaptiveDisabled: p.adaptiveDisabled ?? s.adaptiveDisabled,
          answeredIndices: p.answeredIndices ?? s.answeredIndices,
        })),
      setLastPaperSummary: (s) => set({ lastPaperSummary: s }),
      setMarkedForReview: (indices) => set({ markedForReview: indices }),
      setPendingStart: (p) => set({ pendingStart: p }),
      clearPendingStart: () => set({ pendingStart: null }),
    }),
    {
      name: "adaptest-test-session",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        attemptId: s.attemptId,
        studentName: s.studentName,
        totalQuestions: s.totalQuestions,
        currentIndex: s.currentIndex,
        question: s.question,
        timeLimitSeconds: s.timeLimitSeconds,
        startedAt: s.startedAt,
        lastSummary: s.lastSummary,
        lastPaperSummary: s.lastPaperSummary,
        questionsAnswered: s.questionsAnswered,
        maxReachableIndex: s.maxReachableIndex,
        markedForReview: s.markedForReview,
        canSubmit: s.canSubmit,
        adaptiveDisabled: s.adaptiveDisabled,
        answeredIndices: s.answeredIndices,
        paperAttemptId: s.paperAttemptId,
        paperMeta: s.paperMeta,
        structuredKind: s.structuredKind,
        sectionStartedAt: s.sectionStartedAt,
        attemptFilters: s.attemptFilters,
        pendingStart: s.pendingStart,
      }),
    },
  ),
);

/** True after sessionStorage rehydration so we do not bounce an in-progress test to login. */
export function useHasTestSessionHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useTestSession.persist.hasHydrated());
  useEffect(() => {
    if (useTestSession.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useTestSession.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
