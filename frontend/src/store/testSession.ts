import { create } from "zustand";
import type {
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
  skippedIndices: number[];
  isAdaptive: boolean;
  canSubmit: boolean;
  paperAttemptId: string | null;
  paperMeta: PaperSessionMeta | null;
  sectionStartedAt: string | null;
  pendingStart:
    | {
        studentName: string;
        subject?: string;
        topic?: string;
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
    skippedIndices?: number[];
    questionsAnswered?: number;
    maxReachableIndex?: number;
    isAdaptive?: boolean;
  }) => void;
  hydratePaperStart: (res: TestStartResponse, studentName: string) => void;
  applyPaperNext: (res: PaperNextSection) => void;
  applyNavigate: (p: {
    question: QuestionStudent;
    questionIndex: number;
    questionsAnswered: number;
    maxReachableIndex: number;
    markedForReview: number[];
    skippedIndices?: number[];
    isAdaptive?: boolean;
    canSubmit: boolean;
  }) => void;
  setAfterSubmit: (p: {
    nextQuestion: QuestionStudent | null;
    questionIndex: number | null;
    summary: AttemptSummary | null;
    markedForReview?: number[];
    skippedIndices?: number[];
    questionsAnswered?: number;
    maxReachableIndex?: number;
    isAdaptive?: boolean;
  }) => void;
  setLastPaperSummary: (s: PaperResultSummary | null) => void;
  setMarkedForReview: (indices: number[]) => void;
  setPendingStart: (p: {
    studentName: string;
    subject?: string;
    topic?: string;
    totalQuestions: number;
    timeLimitSeconds?: number | null;
  }) => void;
  clearPendingStart: () => void;
}

const paperClear = {
  paperAttemptId: null as string | null,
  paperMeta: null as PaperSessionMeta | null,
  sectionStartedAt: null as string | null,
  lastPaperSummary: null as PaperResultSummary | null,
};

export const useTestSession = create<TestSessionState>((set) => ({
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
  skippedIndices: [],
  isAdaptive: true,
  canSubmit: true,
  paperAttemptId: null,
  paperMeta: null,
  sectionStartedAt: null,
  pendingStart: null,
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
      skippedIndices: [],
      isAdaptive: true,
      canSubmit: true,
      pendingStart: null,
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
      questionsAnswered: p.questionsAnswered ?? 0,
      maxReachableIndex: p.maxReachableIndex ?? 1,
      markedForReview: p.markedForReview ?? [],
      skippedIndices: p.skippedIndices ?? [],
      isAdaptive: p.isAdaptive ?? true,
      canSubmit: true,
      ...paperClear,
    }),
  hydratePaperStart: (res, studentName) => {
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
      skippedIndices: res.skipped_indices ?? [],
      isAdaptive: res.is_adaptive ?? res.paper.is_adaptive ?? true,
      canSubmit: res.can_submit !== false,
      lastSummary: null,
      paperAttemptId: res.paper.paper_attempt_id,
      paperMeta: res.paper,
      sectionStartedAt: res.started_at,
      lastPaperSummary: null,
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
      skippedIndices: res.skipped_indices ?? [],
      isAdaptive: res.is_adaptive ?? res.paper.is_adaptive ?? true,
      canSubmit: true,
      paperMeta: res.paper,
      paperAttemptId: res.paper.paper_attempt_id,
      sectionStartedAt: new Date().toISOString(),
    }),
  applyNavigate: (p) =>
    set({
      question: p.question,
      currentIndex: p.questionIndex,
      questionsAnswered: p.questionsAnswered,
      maxReachableIndex: p.maxReachableIndex,
      markedForReview: p.markedForReview,
      skippedIndices: p.skippedIndices ?? [],
      isAdaptive: p.isAdaptive ?? true,
      canSubmit: p.canSubmit,
    }),
  setAfterSubmit: (p) =>
    set((s) => ({
      question: p.nextQuestion,
      currentIndex: p.questionIndex ?? s.currentIndex,
      lastSummary: p.summary ?? s.lastSummary,
      questionsAnswered: p.questionsAnswered ?? s.questionsAnswered,
      maxReachableIndex: p.maxReachableIndex ?? s.maxReachableIndex,
      markedForReview: p.markedForReview ?? s.markedForReview,
      skippedIndices: p.skippedIndices ?? s.skippedIndices,
      isAdaptive: p.isAdaptive ?? s.isAdaptive,
      canSubmit: p.nextQuestion != null ? true : s.canSubmit,
    })),
  setLastPaperSummary: (s) => set({ lastPaperSummary: s }),
  setMarkedForReview: (indices) => set({ markedForReview: indices }),
  setPendingStart: (p) => set({ pendingStart: p }),
  clearPendingStart: () => set({ pendingStart: null }),
}));
