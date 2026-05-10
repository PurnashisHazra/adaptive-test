import axios from "axios";
import type {
  AnalyticsOverview,
  AppConfig,
  AssignPaperByTitleBody,
  AssignPaperByTitleResult,
  AssignedPaperItem,
  AttemptSummary,
  AuthResponse,
  BulkImportResult,
  PdfImportPreviewItem,
  PdfImportPreviewResponse,
  Paginated,
  PaperResultSummary,
  QuestionAdmin,
  QuestionCreatePayload,
  QuestionPaper,
  StudentHistoryStats,
  StudentPaperDetail,
  StudentSessionSummary,
  QuestionReport,
  QuestionReportCreatePayload,
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
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function health() {
  const { data } = await api.get("/health");
  return data;
}

export async function signup(body: { username: string; password: string; role_key?: string }) {
  const { data } = await api.post<AuthResponse>("/auth/signup", body);
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
  params: Record<string, string | number | undefined> & { question_type?: string },
) {
  const { data } = await api.get<Paginated<QuestionAdmin>>("/questions", { params });
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
  a.download = `questions-${new Date().toISOString().slice(0, 10)}.csv`;
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

export async function listStudentUsernames() {
  const { data } = await api.get<{ username: string }[]>("/admin/users/students");
  return data.map((u) => u.username);
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

export async function listMyAnalyticsSessions() {
  const { data } = await api.get<StudentSessionSummary[]>("/me/analytics/sessions");
  return data;
}

export async function getMyStandaloneReview(attemptId: string) {
  const { data } = await api.get<StudentStandaloneDetail>(`/me/analytics/standalone/${encodeURIComponent(attemptId)}`);
  return data;
}

export async function getMyPaperReview(paperAttemptId: string) {
  const { data } = await api.get<StudentPaperDetail>(`/me/analytics/paper/${encodeURIComponent(paperAttemptId)}`);
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
