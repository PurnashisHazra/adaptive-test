import axios from "axios";
import { formatDateFilenameIST } from "../lib/istTime";
import type {
  AdminStudentReportCardDetail,
  AdminStudentReportCardSummary,
  AdminStudentReportPdfBundle,
  AnalyticsOverview,
  AppConfig,
  AutoAssignDifficultyResponse,
  AssignPaperByTitleBody,
  AssignPaperByTitleResult,
  AssignedPaperItem,
  AttemptSummary,
  AuthResponse,
  BulkImportResult,
  CoachExplanationHintResponse,
  PdfImportPreviewItem,
  PdfImportPreviewResponse,
  Paginated,
  PaperResultSummary,
  QuestionAdmin,
  QuestionCreatePayload,
  Challenge,
  ChallengeCatalogPage,
  ChallengeParticipantsPage,
  ChallengeRecapResponse,
  QuestionPaper,
  StudentHistoryStats,
  StudentAttemptAccuracyImprovementResponse,
  StudentAttemptTimeStrategyResponse,
  StudentCoachPlanBundle,
  StudentLearningTrendsResponse,
  StudentOverallAnalytics,
  StudentPaperDetail,
  StudentSessionsPage,
  StudentQuestionReviewPage,
  QuestionReport,
  QuestionReportCreatePayload,
  StudentProfileAdminView,
  PracticeAttemptRequestAdminItem,
  PracticeAttemptRequestOut,
  MentorshipBookingAdminItem,
  MentorshipBookingOut,
  MentorshipBookingSignupResponse,
  LeaderConnectRequestAdminItem,
  LeaderConnectRequestOut,
  StudentProfileListItem,
  StudentProfileUpdatePayload,
  StudentSessionControls,
  StudentStandaloneDetail,
  SubmitAnswerResponse,
  TestQuestionAtResponse,
  TestStartResponse,
} from "./types";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  config.headers = config.headers ?? {};
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    try {
      const guestId = localStorage.getItem("adaptest_guest_id");
      if (guestId?.startsWith("guest_")) {
        config.headers["X-Guest-Id"] = guestId;
      }
    } catch {
      /* ignore */
    }
  }
  return config;
});

export async function health() {
  const { data } = await api.get("/health");
  return data;
}

export async function signup(body: { username: string; password: string; mobile?: string; role_key?: string }) {
  const { data } = await api.post<AuthResponse>("/auth/signup", body);
  return data;
}

export async function getMyAccount() {
  const { data } = await api.get<import("./types").StudentAccount>("/me/account");
  return data;
}

export async function updateMyAccount(body: { mobile?: string | null }) {
  const { data } = await api.patch<import("./types").StudentAccount>("/me/account", body);
  return data;
}

export async function getMyPublicProfile() {
  const { data } = await api.get<import("./types").PublicProfile>("/me/public-profile");
  return data;
}

export async function updateMyPublicProfile(body: import("./types").PublicProfileUpdate) {
  const { data } = await api.patch<import("./types").PublicProfile>("/me/public-profile", body);
  return data;
}

export async function getPublicStudentProfile(profileSlug: string) {
  const { data } = await api.get<import("./types").PublicProfile>(
    `/public/students/${encodeURIComponent(profileSlug)}`
  );
  return data;
}

export async function getAuthMe() {
  const { data } = await api.get<import("./types").AuthUser>("/auth/me");
  return data;
}

export async function claimAdminCode(admin_code: string) {
  const { data } = await api.post<import("./types").AuthUser>("/auth/claim-admin-code", { admin_code });
  return data;
}

export async function listSuperAdminUsers() {
  const { data } = await api.get<{ users: import("./types").SuperAdminUserRow[] }>("/super-admin/dashboard/users");
  return data.users;
}

export async function updateSuperAdminUserRole(username: string, role: import("./types").Role) {
  const { data } = await api.patch<import("./types").SuperAdminUserRow>(
    `/super-admin/dashboard/users/${encodeURIComponent(username)}/role`,
    { role }
  );
  return data;
}

export async function setSuperAdminUserAdminCode(username: string, admin_code: string) {
  const { data } = await api.put<import("./types").SuperAdminUserRow>(
    `/super-admin/dashboard/users/${encodeURIComponent(username)}/admin-code`,
    { admin_code }
  );
  return data;
}

export async function generateSuperAdminUserAdminCode(username: string) {
  const { data } = await api.post<import("./types").SuperAdminUserRow>(
    `/super-admin/dashboard/users/${encodeURIComponent(username)}/admin-code/generate`
  );
  return data;
}

export async function setSuperAdminUserAdminLimits(username: string, limits: import("./types").AdminLimits) {
  const { data } = await api.put<import("./types").SuperAdminUserRow>(
    `/super-admin/dashboard/users/${encodeURIComponent(username)}/admin-limits`,
    limits
  );
  return data;
}

export async function login(body: { username: string; password: string }) {
  const { data } = await api.post<AuthResponse>("/auth/login", body);
  return data;
}

export async function getConfig(): Promise<AppConfig> {
  const { data } = await api.get<AppConfig>("/config");
  return data;
}

export async function patchConfig(body: Partial<AppConfig>) {
  const { data } = await api.patch<AppConfig>("/config", body);
  return data;
}

export async function listQuestions(
  params: Record<string, string | number | undefined> & {
    question_type?: string;
    difficulty?: string;
    exam_tag?: string;
  },
) {
  const body = {
    subject: params.subject,
    topic: params.topic,
    difficulty: params.difficulty,
    search: params.search,
    question_type: params.question_type,
    exam_tag: params.exam_tag,
    page: params.page ?? 1,
    page_size: params.page_size ?? 20,
  };
  const { data } = await api.post<Paginated<QuestionAdmin>>("/questions/list", body);
  return data;
}

export async function countQuestions() {
  const { data } = await api.get<{ total: number }>("/questions/count");
  return data.total;
}

export async function getQuestion(id: string) {
  const { data } = await api.get<QuestionAdmin>(`/questions/${id}`);
  return data;
}

export async function createQuestion(body: object) {
  const { data } = await api.post<QuestionAdmin>("/questions", body);
  return data;
}

export async function uploadQuestionImage(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<{ url: string }>("/questions/upload-image", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.url;
}

export async function generateAiQuestionDraft(body: { prompt: string; subject?: string; topic?: string }) {
  const { data } = await api.post<QuestionCreatePayload>("/questions/ai-generate-draft", body);
  return data;
}

export async function autoAssignQuestionDifficulties(body: { question_ids: string[] }) {
  const { data } = await api.post<AutoAssignDifficultyResponse>("/questions/auto-assign-difficulty", body);
  return data;
}

export async function updateQuestion(id: string, body: object) {
  const { data } = await api.patch<QuestionAdmin>(`/questions/${id}`, body);
  return data;
}

export async function deleteQuestion(id: string) {
  await api.delete(`/questions/${id}`);
}

export async function downloadQuestionsCsv(): Promise<void> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch("/api/questions/export/csv", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error("Export failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `questions-${formatDateFilenameIST()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function deleteAllQuestions(): Promise<number> {
  const { data } = await api.delete<{ deleted: number }>("/questions/all");
  return data.deleted;
}

export async function importQuestionsCsv(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<BulkImportResult>("/questions/import/csv", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export type PdfPreviewProgress = {
  /** 0–100 while bytes are uploading; `null` once the server is parsing the PDF. */
  uploadPercent: number | null;
};

export async function previewPdfQuestions(
  file: File,
  subject: string,
  topic: string,
  options?: {
    onProgress?: (p: PdfPreviewProgress) => void;
    signal?: AbortSignal;
  },
) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("subject", subject || "General");
  fd.append("topic", topic || "General");
  const { data } = await api.post<PdfImportPreviewResponse>("/questions/import/pdf/preview", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 600_000,
    signal: options?.signal,
    onUploadProgress: (evt) => {
      if (evt.total && options?.onProgress) {
        options.onProgress({ uploadPercent: Math.round((evt.loaded / evt.total) * 100) });
      }
    },
  });
  return data;
}

export async function commitPdfQuestions(
  questions: PdfImportPreviewItem[],
  options?: { timeout?: number; signal?: AbortSignal },
) {
  const { data } = await api.post<BulkImportResult>(
    "/questions/import/pdf/commit",
    { questions },
    { timeout: options?.timeout ?? 180_000, signal: options?.signal },
  );
  return data;
}

const DEFAULT_PDF_COMMIT_BATCH = 20;

/** Commit many PDF draft rows in smaller HTTP requests to avoid timeouts and body-size limits. */
export async function commitPdfQuestionsBatched(
  questions: PdfImportPreviewItem[],
  options?: {
    batchSize?: number;
    delayMsBetweenBatches?: number;
    onProgress?: (p: { batchIndex: number; batchCount: number; percent: number; insertedSoFar: number; skippedSoFar: number }) => void;
    signal?: AbortSignal;
  },
): Promise<BulkImportResult> {
  const batchSize = Math.max(1, options?.batchSize ?? DEFAULT_PDF_COMMIT_BATCH);
  const delayMs = options?.delayMsBetweenBatches ?? 100;
  const total = questions.length;
  if (total === 0) {
    return { inserted: 0, skipped: 0, errors: [] };
  }
  const batchCount = Math.ceil(total / batchSize);
  let inserted = 0;
  let skipped = 0;
  const errors: BulkImportResult["errors"] = [];

  for (let b = 0, start = 0; start < total; b += 1, start += batchSize) {
    const slice = questions.slice(start, start + batchSize);
    options?.onProgress?.({
      batchIndex: b,
      batchCount,
      percent: Math.round((start / total) * 100),
      insertedSoFar: inserted,
      skippedSoFar: skipped,
    });
    const r = await commitPdfQuestions(slice, { timeout: 240_000, signal: options?.signal });
    inserted += r.inserted;
    skipped += r.skipped;
    const base = start;
    for (const e of r.errors) {
      errors.push({ ...e, row: base + e.row });
    }
    options?.onProgress?.({
      batchIndex: b,
      batchCount,
      percent: Math.round((Math.min(start + slice.length, total) / total) * 100),
      insertedSoFar: inserted,
      skippedSoFar: skipped,
    });
    if (start + batchSize < total && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { inserted, skipped, errors };
}

export async function importQuestionsJson(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<BulkImportResult>("/questions/import/json", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function startTest(body: {
  student_name: string;
  subject?: string | null;
  topic?: string | null;
  exam_tag?: string | null;
  total_questions: number;
  time_limit_seconds?: number | null;
}) {
  const { data } = await api.post<TestStartResponse>("/tests/start", body);
  return data;
}

export async function getTestTopics(subject?: string) {
  const { data } = await api.get<{ topics: string[] }>("/tests/topics", {
    params: { subject: subject || undefined },
  });
  return data.topics;
}

export async function getTestSubjects() {
  const { data } = await api.get<{ subjects: string[] }>("/tests/subjects");
  return data.subjects;
}

export async function submitAnswer(attemptId: string, body: { question_id: string; chosen_answer: string; elapsed_seconds?: number }) {
  const { data } = await api.post<SubmitAnswerResponse>(`/tests/${attemptId}/answer`, body);
  return data;
}

export async function postCoachExplanationHint(attemptId: string, body: { question_id: string }) {
  const { data } = await api.post<CoachExplanationHintResponse>(
    `/tests/${encodeURIComponent(attemptId)}/coach-explanation-hint`,
    body,
  );
  return data;
}

export async function getQuestionAt(attemptId: string, questionIndex: number) {
  const { data } = await api.get<TestQuestionAtResponse>(`/tests/${attemptId}/question/${questionIndex}`);
  return data;
}

export async function patchMarkReview(attemptId: string, body: { question_index: number; marked: boolean }) {
  const { data } = await api.patch<{ marked_for_review: number[] }>(`/tests/${attemptId}/mark-review`, body);
  return data;
}

export async function endTest(attemptId: string) {
  const { data } = await api.post<AttemptSummary>(`/tests/${attemptId}/end`);
  return data;
}

export async function listAssignedPapers() {
  const { data } = await api.get<AssignedPaperItem[]>("/papers/assigned");
  return data;
}

export async function startPaper(paperId: string) {
  const { data } = await api.post<TestStartResponse>(`/papers/${paperId}/start`);
  return data;
}

export async function resumePaper(paperId: string) {
  const { data } = await api.post<TestStartResponse>(`/papers/${paperId}/resume`);
  return data;
}

export async function endPaperAttempt(paperAttemptId: string) {
  const { data } = await api.post<{ paper_summary: PaperResultSummary }>(`/papers/attempts/${paperAttemptId}/end`);
  return data.paper_summary;
}

export async function timeoutPaperSection(paperAttemptId: string) {
  const { data } = await api.post<SubmitAnswerResponse>(`/papers/attempts/${paperAttemptId}/timeout-section`);
  return data;
}

export async function listQuestionPapers() {
  const { data } = await api.get<QuestionPaper[]>("/admin/question-papers");
  return data;
}

export async function getQuestionPaper(id: string) {
  const { data } = await api.get<QuestionPaper>(`/admin/question-papers/${id}`);
  return data;
}

export async function createQuestionPaper(body: object) {
  const { data } = await api.post<QuestionPaper>("/admin/question-papers", body);
  return data;
}

export async function updateQuestionPaper(id: string, body: object) {
  const { data } = await api.patch<QuestionPaper>(`/admin/question-papers/${id}`, body);
  return data;
}

export async function assignPaper(paperId: string, student_username: string) {
  await api.post(`/admin/question-papers/${paperId}/assign`, { student_username });
}

export async function syncPaperAssignments(paperId: string, student_usernames: string[]) {
  await api.put(`/admin/question-papers/${paperId}/assignments`, { student_usernames });
}

export async function assignQuestionPaperByTitle(body: AssignPaperByTitleBody) {
  const { data } = await api.post<AssignPaperByTitleResult>("/admin/question-papers/assign-by-title", body);
  return data;
}

export async function unassignPaper(paperId: string, username: string) {
  await api.delete(`/admin/question-papers/${paperId}/assign/${encodeURIComponent(username)}`);
}

export async function listPaperAssignments(paperId: string) {
  const { data } = await api.get<{ paper_id: string; student_username: string; assigned_at: string }[]>(
    `/admin/question-papers/${paperId}/assignments`
  );
  return data;
}

export async function listChallengeCatalog(page = 1, pageSize = 3, guestId?: string) {
  const { data } = await api.get<ChallengeCatalogPage>("/challenges/catalog", {
    params: { page, page_size: pageSize, ...(guestId ? { guest_id: guestId } : {}) },
  });
  return data;
}

export async function listChallengeParticipants(challengeId: string, page = 1, pageSize = 20) {
  const { data } = await api.get<ChallengeParticipantsPage>(`/challenges/${challengeId}/participants`, {
    params: { page, page_size: pageSize },
  });
  return data;
}

export async function startChallenge(challengeId: string, displayName?: string) {
  const body = displayName?.trim() ? { display_name: displayName.trim() } : {};
  const { data } = await api.post<TestStartResponse>(`/challenges/${challengeId}/start`, body);
  return data;
}

export async function getChallengeRecap(challengeAttemptId: string) {
  const { data } = await api.get<ChallengeRecapResponse>(
    `/challenges/attempts/${encodeURIComponent(challengeAttemptId)}/recap`,
  );
  return data;
}

export async function submitChallengeGuestSignup(challengeAttemptId: string, email: string, password: string) {
  const { data } = await api.post<AuthResponse>(
    `/challenges/attempts/${encodeURIComponent(challengeAttemptId)}/guest-signup`,
    { email, password },
  );
  return data;
}

export async function resumeChallenge(challengeId: string) {
  const { data } = await api.post<TestStartResponse>(`/challenges/${challengeId}/resume`);
  return data;
}

export async function endChallengeAttempt(challengeAttemptId: string) {
  const { data } = await api.post<{ paper_summary: PaperResultSummary }>(
    `/challenges/attempts/${challengeAttemptId}/end`
  );
  return data;
}

export async function timeoutChallengeSection(challengeAttemptId: string) {
  const { data } = await api.post<SubmitAnswerResponse>(`/challenges/attempts/${challengeAttemptId}/timeout-section`);
  return data;
}

export async function listChallenges() {
  const { data } = await api.get<Challenge[]>("/admin/challenges");
  return data;
}

export async function getChallenge(id: string) {
  const { data } = await api.get<Challenge>(`/admin/challenges/${id}`);
  return data;
}

export async function createChallenge(body: object) {
  const { data } = await api.post<Challenge>("/admin/challenges", body);
  return data;
}

export async function updateChallenge(id: string, body: object) {
  const { data } = await api.patch<Challenge>(`/admin/challenges/${id}`, body);
  return data;
}

export async function syncChallengeAssignments(challengeId: string, student_usernames: string[]) {
  await api.put(`/admin/challenges/${challengeId}/assignments`, { student_usernames });
}

export async function listChallengeAssignments(challengeId: string) {
  const { data } = await api.get<{ challenge_id: string; student_username: string; assigned_at: string }[]>(
    `/admin/challenges/${challengeId}/assignments`
  );
  return data;
}

export async function listStudentUsernames() {
  const { data } = await api.get<{ username: string }[]>("/admin/users/students");
  return data.map((u) => u.username);
}

export async function listAdminStudents() {
  const { data } = await api.get<StudentProfileListItem[]>("/admin/students");
  return data;
}

export async function listAdminStudentExamTags() {
  const { data } = await api.get<{ exam_tags: string[] }>("/admin/students/exam-tags");
  return data.exam_tags;
}

export async function listAdminPapersCatalog() {
  const { data } = await api.get<{ papers: { id: string; title: string }[] }>("/admin/students/papers-catalog");
  return data.papers;
}

export async function getAdminStudentProfile(username: string) {
  const { data } = await api.get<StudentProfileAdminView>(`/admin/students/${encodeURIComponent(username)}`);
  return data;
}

export async function updateAdminStudentProfile(username: string, body: StudentProfileUpdatePayload) {
  const { data } = await api.put<StudentProfileAdminView>(`/admin/students/${encodeURIComponent(username)}`, body);
  return data;
}

export async function listAdminStudentReportCards() {
  const { data } = await api.get<{ students: AdminStudentReportCardSummary[] }>("/admin/students/report-cards");
  return data.students;
}

export async function getAdminStudentReportCard(username: string) {
  const { data } = await api.get<AdminStudentReportCardDetail>(
    `/admin/students/${encodeURIComponent(username)}/report-card`,
  );
  return data;
}

export async function getAdminStudentReportPdfBundle(username: string, refreshCoach = false) {
  const { data } = await api.get<AdminStudentReportPdfBundle>(
    `/admin/students/${encodeURIComponent(username)}/report-pdf-bundle`,
    { params: refreshCoach ? { refresh_coach: true } : undefined },
  );
  return data;
}


export async function getMySessionControls() {
  const { data } = await api.get<StudentSessionControls>("/me/session-controls");
  return data;
}

export async function requestMorePracticeAttempts(message?: string) {
  const { data } = await api.post<PracticeAttemptRequestOut>("/me/practice-attempt-requests", {
    message: message?.trim() || undefined,
  });
  return data;
}

export async function listAdminPracticeAttemptRequests() {
  const { data } = await api.get<PracticeAttemptRequestAdminItem[]>("/admin/students/practice-attempt-requests");
  return data;
}

export async function approveAdminPracticeAttemptRequest(requestId: string) {
  const { data } = await api.post<PracticeAttemptRequestOut>(
    `/admin/students/practice-attempt-requests/${encodeURIComponent(requestId)}/approve`,
  );
  return data;
}

export async function denyAdminPracticeAttemptRequest(requestId: string) {
  const { data } = await api.post<PracticeAttemptRequestOut>(
    `/admin/students/practice-attempt-requests/${encodeURIComponent(requestId)}/deny`,
  );
  return data;
}

export async function createMentorshipBooking(body: {
  session_date: string;
  session_time: string;
  pre_meet_question: string;
}) {
  const { data } = await api.post<MentorshipBookingOut>("/mentorship/bookings", body);
  return data;
}

export async function createMentorshipBookingWithSignup(body: {
  session_date: string;
  session_time: string;
  pre_meet_question: string;
  username: string;
  password: string;
  mobile: string;
}) {
  const { data } = await api.post<MentorshipBookingSignupResponse>("/mentorship/bookings/with-signup", body);
  return data;
}

export async function getMentorshipBooking(bookingId: string) {
  const { data } = await api.get<MentorshipBookingOut>(`/mentorship/bookings/${encodeURIComponent(bookingId)}`);
  return data;
}

export async function listAdminMentorshipBookingsPending() {
  const { data } = await api.get<MentorshipBookingAdminItem[]>("/admin/mentorship-bookings/pending");
  return data;
}

export async function approveAdminMentorshipBooking(bookingId: string) {
  const { data } = await api.post<MentorshipBookingOut>(
    `/admin/mentorship-bookings/${encodeURIComponent(bookingId)}/approve`,
  );
  return data;
}

export async function rejectAdminMentorshipBooking(bookingId: string) {
  const { data } = await api.post<MentorshipBookingOut>(
    `/admin/mentorship-bookings/${encodeURIComponent(bookingId)}/reject`,
  );
  return data;
}

export async function submitLeaderConnectRequest(form: FormData) {
  const { data } = await api.post<LeaderConnectRequestOut>("/leader-connect/requests", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listAdminLeaderConnectRequests() {
  const { data } = await api.get<LeaderConnectRequestAdminItem[]>("/admin/leader-connect/requests");
  return data;
}

export async function markAdminLeaderConnectReviewed(requestId: string) {
  const { data } = await api.post<LeaderConnectRequestOut>(
    `/admin/leader-connect/requests/${encodeURIComponent(requestId)}/mark-reviewed`,
  );
  return data;
}

export async function downloadLeaderConnectCv(requestId: string, filename: string): Promise<void> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`/api/admin/leader-connect/requests/${encodeURIComponent(requestId)}/cv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error("Download failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "cv";
  a.click();
  URL.revokeObjectURL(url);
}

export async function listAttempts(params?: { student_name?: string; limit?: number }) {
  const { data } = await api.get("/attempts", { params });
  return data;
}

/** Admin-only: named student history. Students must use {@link getMyStudentHistory}. */
export async function getStudentHistory(studentName: string) {
  const { data } = await api.get<StudentHistoryStats>(`/attempts/students/${encodeURIComponent(studentName)}`);
  return data;
}

/** Logged-in user's own attempt history (JWT subject). */
export async function getMyStudentHistory() {
  const { data } = await api.get<StudentHistoryStats>("/attempts/me/history");
  return data;
}

export async function listMyAnalyticsSessions(params?: {
  page?: number;
  pageSize?: number;
  sessionType?: "standalone" | "paper";
}) {
  const { data } = await api.get<StudentSessionsPage>("/me/analytics/sessions", {
    params: {
      page: params?.page ?? 1,
      page_size: params?.pageSize ?? 15,
      session_type: params?.sessionType,
    },
  });
  return data;
}

export async function getMyLearningTrends() {
  const { data } = await api.get<StudentLearningTrendsResponse>("/me/analytics/learning-trends");
  return data;
}

export async function getMyOverallAnalytics(params?: { subject?: string; topic?: string; exam_tag?: string }) {
  const { data } = await api.get<StudentOverallAnalytics>("/me/analytics/overall", {
    params: {
      subject: params?.subject || undefined,
      topic: params?.topic || undefined,
      exam_tag: params?.exam_tag || undefined,
    },
  });
  return data;
}

export async function getMyStandaloneReview(attemptId: string) {
  const { data } = await api.get<StudentStandaloneDetail>(`/me/analytics/standalone/${encodeURIComponent(attemptId)}`);
  return data;
}

export async function getMyCoachPlan(params?: { subject?: string; topic?: string; exam_tag?: string }) {
  const { data } = await api.get<StudentCoachPlanBundle>("/me/analytics/coach/plan", {
    params: {
      subject: params?.subject || undefined,
      topic: params?.topic || undefined,
      exam_tag: params?.exam_tag || undefined,
    },
  });
  return data;
}

export async function getMyAttemptTimeStrategy(
  attemptId: string,
  params?: { subject?: string; topic?: string; exam_tag?: string },
) {
  const { data } = await api.get<StudentAttemptTimeStrategyResponse>(
    `/me/analytics/standalone/${encodeURIComponent(attemptId)}/time-strategy`,
    {
      params: {
        subject: params?.subject || undefined,
        topic: params?.topic || undefined,
        exam_tag: params?.exam_tag || undefined,
      },
    },
  );
  return data;
}

export async function getMyAttemptAccuracyImprovement(
  attemptId: string,
  params?: { subject?: string; topic?: string; exam_tag?: string },
) {
  const { data } = await api.get<StudentAttemptAccuracyImprovementResponse>(
    `/me/analytics/standalone/${encodeURIComponent(attemptId)}/accuracy-improvement`,
    {
      params: {
        subject: params?.subject || undefined,
        topic: params?.topic || undefined,
        exam_tag: params?.exam_tag || undefined,
      },
    },
  );
  return data;
}

export async function getMyPaperReview(paperAttemptId: string, includeQuestions = false) {
  const { data } = await api.get<StudentPaperDetail>(`/me/analytics/paper/${encodeURIComponent(paperAttemptId)}`, {
    params: { include_questions: includeQuestions },
  });
  return data;
}

export async function getMyPaperSectionQuestions(
  paperAttemptId: string,
  sectionAttemptId: string,
  page = 1,
  pageSize = 8,
) {
  const { data } = await api.get<StudentQuestionReviewPage>(
    `/me/analytics/paper/${encodeURIComponent(paperAttemptId)}/sections/${encodeURIComponent(sectionAttemptId)}/questions`,
    { params: { page, page_size: pageSize } },
  );
  return data;
}

export async function getAnalytics() {
  const { data } = await api.get<AnalyticsOverview>("/analytics/overview");
  return data;
}

export async function submitQuestionReport(body: QuestionReportCreatePayload) {
  const { data } = await api.post<QuestionReport>("/me/question-reports", body);
  return data;
}

export async function listAdminQuestionReports(params?: { page?: number; page_size?: number }) {
  const { data } = await api.get<Paginated<QuestionReport>>("/admin/question-reports", { params });
  return data;
}

export function exportAttemptsUrl(format: "csv" | "json") {
  return `/api/attempts/export?format=${format}`;
}

export type { AttemptSummary };
