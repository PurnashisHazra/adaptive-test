export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT";
export type QuestionType = "mcq_single" | "true_false" | "tita";
export type Role = "student" | "admin";
export type ExamTag = "CAT" | "SSC" | "BANK" | "RAILWAY" | "DEFENCE" | "STATE" | "OTHER";

export interface AuthUser {
  username: string;
  role: Role;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface QuestionOption {
  key: string;
  label: string;
}

export interface QuestionAdmin {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: QuestionOption[];
  correct_answer: string;
  explanation?: string | null;
  image_url?: string | null;
  difficulty: Difficulty;
  subject: string;
  topic: string;
  tags: string[];
  is_ai_generated?: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuestionCreatePayload {
  question_text: string;
  question_type: QuestionType;
  options: QuestionOption[];
  correct_answer: string;
  explanation?: string | null;
  image_url?: string | null;
  difficulty: Difficulty;
  subject: string;
  topic: string;
  tags: string[];
  is_ai_generated?: boolean;
}

export interface QuestionStudent {
  id: string;
  question_text: string;
  question_type: string;
  options: { key: string; label: string }[];
  subject: string;
  topic: string;
  image_url?: string | null;
}

export interface PaperSessionMeta {
  paper_attempt_id: string;
  paper_id: string;
  paper_title: string;
  section_index: number;
  section_title: string;
  total_sections: number;
  marks_per_correct: number;
  marks_per_incorrect: number;
}

export interface TestStartResponse {
  attempt_id: string;
  question: QuestionStudent;
  question_index: number;
  total_questions: number;
  time_limit_seconds?: number | null;
  started_at: string;
  marked_for_review?: number[];
  questions_answered?: number;
  max_reachable_index?: number;
  can_submit?: boolean;
  paper?: PaperSessionMeta | null;
}

export interface PaperNextSection {
  attempt_id: string;
  question: QuestionStudent;
  question_index: number;
  total_questions: number;
  time_limit_seconds?: number | null;
  started_at: string;
  marked_for_review: number[];
  questions_answered: number;
  max_reachable_index: number;
  paper: PaperSessionMeta;
}

export interface PaperSectionResultItem {
  section_title: string;
  total_questions: number;
  correct: number;
  wrong: number;
  marks: number;
}

export interface PaperResultSummary {
  paper_attempt_id: string;
  paper_id: string;
  title: string;
  student_name: string;
  total_marks: number;
  max_marks: number;
  percentage: number;
  sections: PaperSectionResultItem[];
  started_at: string;
  completed_at: string;
  ended_early: boolean;
}

export interface AssignedPaperItem {
  paper_id: string;
  title: string;
  marks_per_correct: number;
  marks_per_incorrect: number;
  section_count: number;
  has_started: boolean;
  completed: boolean;
  paper_attempt_id?: string | null;
}

export interface QuestionPaperSection {
  id: string;
  title: string;
  order: number;
  subject?: string | null;
  topic?: string | null;
  exam_tag?: ExamTag | null;
  total_questions: number;
  time_limit_seconds: number;
}

export interface QuestionPaper {
  id: string;
  title: string;
  sections: QuestionPaperSection[];
  marks_per_correct: number;
  marks_per_incorrect: number;
  created_at: string;
  updated_at: string;
}

export interface AssignPaperByTitleBody {
  title: string;
  assignees: string[];
}

export interface AssignPaperByTitleResult {
  paper_id: string;
  paper_title: string;
  assignees: string[];
}

export interface SubmitAnswerResponse {
  is_correct: boolean;
  explanation?: string | null;
  completed: boolean;
  next_question?: QuestionStudent | null;
  question_index?: number | null;
  summary?: AttemptSummary | null;
  marked_for_review?: number[];
  questions_answered?: number;
  max_reachable_index?: number;
  paper_next?: PaperNextSection | null;
  paper_summary?: PaperResultSummary | null;
}

export interface TestQuestionAtResponse {
  question: QuestionStudent;
  question_index: number;
  chosen_answer: string | null;
  can_submit: boolean;
  total_questions: number;
  max_reachable_index: number;
  questions_answered: number;
  marked_for_review: number[];
}

export interface AnswerRecord {
  question_id: string;
  chosen_answer: string;
  is_correct: boolean;
  difficulty_when_served: Difficulty;
  target_difficulty_after?: Difficulty | null;
  time_spent_seconds?: number | null;
}

export interface AttemptSummary {
  attempt_id: string;
  student_name: string;
  score: number;
  total_questions: number;
  percentage: number;
  subject?: string | null;
  topic?: string | null;
  started_at: string;
  completed_at: string;
  answers: AnswerRecord[];
  ended_early?: boolean;
}

export interface AppConfig {
  subject_filter_enabled: boolean;
  topic_filter_enabled: boolean;
  default_test_question_count: number;
  default_time_limit_seconds: number;
  difficulty_wave_enabled: boolean;
  difficulty_sequence: Difficulty[];
  difficulty_transition_enabled: boolean;
  difficulty_transition_map: Record<Difficulty, { if_correct: Difficulty; if_wrong: Difficulty }>;
}

export interface AttemptQuestionStep {
  sequence: number;
  question_id: string;
  question_text: string;
  difficulty: string;
  time_spent_seconds: number | null;
  is_correct: boolean;
}

export interface AttemptBreakdown {
  attempt_id: string;
  student_name: string;
  status: string;
  score: number;
  total_questions: number;
  percentage: number;
  started_at: string;
  completed_at?: string | null;
  steps: AttemptQuestionStep[];
}

export interface AnalyticsOverview {
  total_questions: number;
  total_attempts: number;
  completed_attempts: number;
  average_score: number;
  average_percentage: number;
  accuracy_by_difficulty: { difficulty: string; correct: number; total: number; accuracy: number }[];
  accuracy_by_topic: { topic: string; correct: number; total: number; accuracy: number }[];
  most_missed_questions: { question_id: string; question_text: string; miss_count: number }[];
  recent_attempts: {
    id: string;
    student_name: string;
    score: number;
    total_questions: number;
    percentage: number;
    started_at: string;
    completed_at?: string | null;
  }[];
  top_performers: {
    student_name: string;
    attempts: number;
    average_score: number;
    best_percentage: number;
  }[];
  attempt_breakdowns?: AttemptBreakdown[];
}

export interface StudentHistoryStats {
  student_name: string;
  tests_taken: number;
  average_score: number;
  best_score: number;
  best_percentage: number;
  recent_attempts: {
    id: string;
    student_name: string;
    status: string;
    score: number;
    total_questions: number;
    percentage: number;
    subject?: string | null;
    topic?: string | null;
    started_at: string;
    completed_at?: string | null;
  }[];
}

export type StudentSessionType = "standalone" | "paper";

export interface StudentSessionSummary {
  session_type: StudentSessionType;
  id: string;
  title: string;
  subtitle?: string | null;
  started_at: string;
  completed_at?: string | null;
  status: string;
  kind_label: string;
}

export interface StudentQuestionOptionOut {
  key: string;
  label: string;
}

export interface StudentQuestionReview {
  index: number;
  question_id: string;
  question_text: string;
  image_url?: string | null;
  question_type: string;
  options: StudentQuestionOptionOut[];
  chosen_answer: string;
  correct_answer: string;
  chosen_label: string;
  correct_label: string;
  is_correct: boolean;
  explanation?: string | null;
  time_spent_seconds?: number | null;
  difficulty_when_served?: string | null;
  answer_attempt_id?: string;
  peer_answer_count?: number;
  peer_accuracy_percent?: number | null;
  peer_avg_time_seconds?: number | null;
  peer_time_peer_sample_count?: number;
  your_time_faster_than_peer_percent?: number | null;
}

export interface StudentStandaloneDetail {
  attempt_id: string;
  title: string;
  subject?: string | null;
  topic?: string | null;
  status: string;
  started_at: string;
  completed_at?: string | null;
  score: number;
  total_questions: number;
  percentage?: number | null;
  ended_early: boolean;
  questions: StudentQuestionReview[];
}

export interface StudentPaperSectionReview {
  section_index: number;
  section_title: string;
  attempt_id: string;
  status: string;
  questions: StudentQuestionReview[];
}

export interface StudentPaperDetail {
  paper_attempt_id: string;
  paper_id: string;
  paper_title: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  total_marks?: number | null;
  max_marks?: number | null;
  percentage?: number | null;
  ended_early: boolean;
  cohort_scored_attempt_count?: number;
  your_score_better_than_percent?: number | null;
  sections: StudentPaperSectionReview[];
}

export type QuestionReportSessionType = "standalone" | "paper_section";

export interface QuestionReport {
  id: string;
  student_username: string;
  question_id: string;
  question_text_snapshot?: string | null;
  question_index: number;
  attempt_id: string;
  session_type: QuestionReportSessionType;
  paper_attempt_id?: string | null;
  paper_title_snapshot?: string | null;
  message?: string | null;
  created_at: string;
}

export interface QuestionReportCreatePayload {
  attempt_id: string;
  question_id: string;
  question_index: number;
  message?: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface PdfImportPreviewItem {
  question_text: string;
  question_type: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation?: string | null;
  image_url?: string | null;
  difficulty: string;
  subject: string;
  topic: string;
  exam_tag: ExamTag;
}

export interface PdfImportPreviewResponse {
  drafts: PdfImportPreviewItem[];
  parse_mode: string;
  message?: string | null;
  truncated: boolean;
}

export interface BulkImportResult {
  inserted: number;
  skipped: number;
  errors: { row: number; field?: string | null; error: string }[];
}
