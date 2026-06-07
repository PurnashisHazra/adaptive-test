export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT";
export type QuestionType = "mcq_single" | "true_false" | "tita";
export type Role = "student" | "admin" | "super_admin";
export type ExamTag = "CAT" | "SSC" | "BANK" | "RAILWAY" | "DEFENCE" | "STATE" | "OTHER";

export interface AuthUser {
  username: string;
  role: Role;
  needs_admin_code?: boolean;
  assigned_admin_code?: string | null;
  admin_code?: string | null;
  mobile?: string | null;
}

export interface StudentAccount {
  username: string;
  mobile?: string | null;
  needs_admin_code: boolean;
  assigned_admin_code?: string | null;
}

export interface QuestionBankFilter {
  exam_tags: string[];
  subjects: string[];
  topics: string[];
  difficulties: Difficulty[];
}

export interface AdminLimits {
  max_papers?: number | null;
  max_students?: number | null;
  max_monthly_student_attempts?: number | null;
  question_bank_filter: QuestionBankFilter;
}

export interface AdminLimitsUsage {
  papers_count: number;
  students_count: number;
  monthly_attempts_count: number;
}

export interface SuperAdminUserRow {
  username: string;
  role: Role;
  admin_code?: string | null;
  assigned_admin_code?: string | null;
  admin_limits?: AdminLimits | null;
  admin_limits_usage?: AdminLimitsUsage | null;
  created_at?: string | null;
  updated_at?: string | null;
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

export interface AutoAssignDifficultyResponse {
  updated: number;
  errors: string[];
}

export interface QuestionStudent {
  id: string;
  question_text: string;
  question_type: string;
  options: { key: string; label: string }[];
  subject: string;
  topic: string;
  image_url?: string | null;
  /** EASY | MEDIUM | HARD | EXPERT when known */
  difficulty?: string | null;
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

export interface AttemptSessionFilters {
  subject?: string | null;
  topic?: string | null;
  exam_tag?: string | null;
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
  attempt_filters?: AttemptSessionFilters;
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
  cohort_percentile?: number | null;
  cohort_ranked_count?: number;
  percentile_is_final?: boolean;
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
  /** When non-empty, the section only serves these questions (adaptive within the set). */
  question_pool_ids?: string[] | null;
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

export type ChallengeLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
export type ChallengeStatus = "upcoming" | "live" | "ended";

export interface Challenge {
  id: string;
  title: string;
  description: string;
  level: ChallengeLevel;
  is_adaptive: boolean;
  launch_at: string;
  end_at: string;
  open_to_all: boolean;
  sections: QuestionPaperSection[];
  marks_per_correct: number;
  marks_per_incorrect: number;
  created_at: string;
  updated_at: string;
}

export interface ChallengeParticipantBrief {
  profile_slug: string;
  display_name: string;
  completed: boolean;
}

export interface ChallengeCatalogPage {
  items: ChallengeCatalogItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ChallengeCatalogItem {
  challenge_id: string;
  title: string;
  description: string;
  level: ChallengeLevel;
  is_adaptive: boolean;
  launch_at: string;
  end_at: string;
  open_to_all: boolean;
  section_count: number;
  marks_per_correct: number;
  marks_per_incorrect: number;
  status: ChallengeStatus;
  seconds_until_launch?: number | null;
  seconds_until_end?: number | null;
  has_access: boolean;
  has_started: boolean;
  completed: boolean;
  challenge_attempt_id?: string | null;
  participants_count: number;
  ranked_count: number;
  my_percentile?: number | null;
  my_final_percentile?: number | null;
  participants: ChallengeParticipantBrief[];
  participants_preview_limit?: number;
}

export interface ChallengeParticipantsPage {
  challenge_id: string;
  participants: ChallengeParticipantBrief[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ChallengeKnowledgeGapItem {
  title: string;
  detail: string;
  metric?: string | null;
  tone: "accent" | "time" | "warn" | "neutral" | string;
}

export interface ChallengeRecapResponse {
  paper_summary: PaperResultSummary;
  insights: StudentPerformanceInsights;
  questions: StudentQuestionReview[];
  knowledge_gaps: ChallengeKnowledgeGapItem[];
}

export interface PublicProfile {
  profile_slug: string;
  display_name: string;
  bio: string;
  updated_at?: string | null;
}

export interface PublicProfileUpdate {
  profile_slug?: string;
  display_name?: string;
  bio?: string;
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

export interface CoachExplanationHintResponse {
  openai_configured: boolean;
  used_openai: boolean;
  hint: string;
  error?: string | null;
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
  cohort_percentile?: number | null;
  cohort_ranked_count?: number;
  percentile_is_final?: boolean;
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

export interface StudentSessionsPage {
  items: StudentSessionSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface StudentDifficultyLevelStat {
  level: string;
  total: number;
  correct: number;
  correct_rate?: number | null;
  avg_time_seconds?: number | null;
}

export interface StudentQuestionReviewPage {
  questions: StudentQuestionReview[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export type StudentOverallDimensionKey = "time" | "difficulty" | "knowledge";
export type StudentOverallAxisViewKey = "time_knowledge" | "time_difficulty" | "difficulty_knowledge";

export interface StudentOverallFactor {
  name: string;
  strength: number;
  weakness: number;
}

export interface StudentOverallDimension {
  key: StudentOverallDimensionKey;
  label: string;
  factors: StudentOverallFactor[];
  overall_strength: number;
  overall_weakness: number;
}

export interface StudentOverallAxisView {
  key: StudentOverallAxisViewKey;
  label: string;
  x_dimension: StudentOverallDimensionKey;
  y_dimension: StudentOverallDimensionKey;
  x_strength: number;
  y_strength: number;
}

export interface StudentOverallAttemptPoint {
  attempt_id: string;
  label: string;
  time_strength: number;
  difficulty_strength: number;
  knowledge_strength: number;
}

export interface StudentOverallDesiredState {
  time_strength: number;
  difficulty_strength: number;
  knowledge_strength: number;
}

export interface StudentOverallAnalytics {
  attempts_considered: number;
  questions_considered: number;
  dimensions: StudentOverallDimension[];
  axis_views: StudentOverallAxisView[];
  attempt_points: StudentOverallAttemptPoint[];
  desired_state: StudentOverallDesiredState;
  strategy_to_desired_state: string[];
}

export interface StudentTrendFilterOptions {
  subjects: string[];
  topics: string[];
  exams: string[];
}

export interface StudentTrendPoint {
  attempt_id: string;
  started_at: string;
  session_kind: "standalone" | "paper_section";
  subject?: string | null;
  topic?: string | null;
  exam_tag?: string | null;
  accuracy_percent: number;
  total_time_seconds: number;
  questions_answered: number;
  score: number;
}

export interface StudentLearningTrendsResponse {
  points: StudentTrendPoint[];
  filter_options: StudentTrendFilterOptions;
}

export type StudentTimeStrategyAction = "full_attempt" | "time_cap" | "defer_revisit" | "skip_if_behind";

export interface StudentTimeStrategyPerQuestion {
  index: number;
  time_action: StudentTimeStrategyAction;
  risk_level: "low" | "medium" | "high";
  hint: string;
}

export interface StudentAttemptTimeStrategyResponse {
  openai_configured: boolean;
  used_openai: boolean;
  error?: string | null;
  summary: string;
  risks_overview: string;
  per_question: StudentTimeStrategyPerQuestion[];
  cumulative_optimal_seconds: number[];
}

export type AccuracyBuildCategory = "concept" | "trick" | "formula" | "deep_knowledge" | "mixed";

export interface StudentAccuracyBuildItem {
  title: string;
  category: AccuracyBuildCategory;
  what_to_build: string;
  question_indices: number[];
}

export interface StudentAttemptAccuracyImprovementResponse {
  openai_configured: boolean;
  used_openai: boolean;
  error?: string | null;
  summary: string;
  subject_context: string;
  exam_context: string;
  build_items: StudentAccuracyBuildItem[];
  practice_drills: string[];
}

/** Persisted coach payloads for in-test hints (same lens as analytics). */
export interface StudentCoachPlanBundle {
  has_accuracy: boolean;
  has_time: boolean;
  accuracy_plan?: Record<string, unknown> | null;
  time_plan?: Record<string, unknown> | null;
  updated_at?: string | null;
}

/** Subject / topic / exam filters aligned with attempt session fields (used for charts + overall analytics). */
export type StudentSessionFilters = {
  subject: string;
  topic: string;
  exam: string;
};

export type StudentInsightCapsuleKey = "missed_opportunity" | "wasted_time" | "skip_revisit";

export interface StudentInsightCapsule {
  key: StudentInsightCapsuleKey;
  label: string;
  hint?: string | null;
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
  insight_capsules?: StudentInsightCapsule[];
}

export interface StudentInsightArea {
  name: string;
  attempts: number;
  accuracy_percent: number;
  avg_time_seconds?: number | null;
}

export interface StudentStrategyAdvice {
  title: string;
  detail: string;
}

export interface StudentPerformanceInsights {
  attempted_questions: number;
  correct_questions: number;
  accuracy_percent: number;
  avg_time_seconds?: number | null;
  wasted_time_questions: number;
  missed_opportunity_questions: number;
  skip_candidate_questions: number;
  strong_areas: StudentInsightArea[];
  weak_areas: StudentInsightArea[];
  recommendations: StudentStrategyAdvice[];
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
  cohort_percentile?: number | null;
  cohort_ranked_count?: number;
  percentile_is_final?: boolean;
  questions: StudentQuestionReview[];
  insights: StudentPerformanceInsights;
}

export interface StudentPaperSectionReview {
  section_index: number;
  section_title: string;
  attempt_id: string;
  status: string;
  questions: StudentQuestionReview[];
  question_count?: number;
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
  cohort_percentile?: number | null;
  cohort_ranked_count?: number;
  percentile_is_final?: boolean;
  sections: StudentPaperSectionReview[];
  insights: StudentPerformanceInsights;
  difficulty_stats?: StudentDifficultyLevelStat[];
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

export interface StudentProfileListItem {
  student_username: string;
  display_name?: string | null;
  blocked: boolean;
  practice_attempts_allowance?: number | null;
  practice_attempts_unlimited?: boolean;
  practice_attempts_used: number;
  allowed_exam_tags: string[];
  assigned_paper_count: number;
}

export interface StudentProfileAdminView {
  student_username: string;
  display_name?: string | null;
  practice_attempts_allowance?: number | null;
  practice_attempts_unlimited?: boolean;
  allowed_exam_tags: string[];
  blocked: boolean;
  assigned_paper_ids: string[];
  practice_attempts_used: number;
  updated_at?: string | null;
}

export interface StudentProfileUpdatePayload {
  display_name?: string | null;
  practice_attempts_allowance?: number | null;
  practice_attempts_unlimited?: boolean;
  allowed_exam_tags: string[];
  blocked: boolean;
  assigned_paper_ids: string[];
}

export interface StudentSessionControls {
  student_username: string;
  display_name: string;
  blocked: boolean;
  block_reason?: string | null;
  practice_attempts_allowance?: number | null;
  practice_attempts_unlimited?: boolean;
  practice_attempts_used: number;
  practice_attempts_remaining?: number | null;
  allowed_exam_tags: string[];
  can_start_practice_test: boolean;
  has_pending_practice_request?: boolean;
  can_request_more_attempts?: boolean;
}

export interface PracticeAttemptRequestOut {
  id: string;
  student_username: string;
  status: "pending" | "approved" | "denied";
  message?: string | null;
  requested_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
}

export interface PracticeAttemptRequestAdminItem {
  id: string;
  student_username: string;
  display_name?: string | null;
  status: "pending" | "approved" | "denied";
  message?: string | null;
  requested_at: string;
  practice_attempts_used: number;
  practice_attempts_allowance?: number | null;
}

export type StrategyFollowStatus = "on_track" | "partial" | "needs_focus" | "insufficient_data";
export type LiveCoachStatus = "active" | "plan_ready" | "inactive";

export interface AdminStudentReportLatestAttempt {
  attempt_id: string;
  title: string;
  started_at: string;
  score: number;
  total_questions: number;
  accuracy_percent: number;
  actual_running_accuracy_percent?: number | null;
  strategy_running_accuracy_percent?: number | null;
  accuracy_lift_points?: number | null;
  wasted_time_flags: number;
  missed_opportunity_flags: number;
}

export interface AdminStudentReportCardSummary {
  student_username: string;
  display_name?: string | null;
  blocked: boolean;
  attempts_considered: number;
  tests_taken: number;
  average_accuracy_percent?: number | null;
  strategy_follow_status: StrategyFollowStatus;
  strategy_follow_percent?: number | null;
  live_coach_status: LiveCoachStatus;
  has_coach_plan: boolean;
  coach_explanation_hints_total: number;
  latest_attempt?: AdminStudentReportLatestAttempt | null;
  strategy_preview: string[];
}

export interface AdminStudentReportCardDetail extends AdminStudentReportCardSummary {
  overall?: StudentOverallAnalytics | null;
  latest_attempt_detail?: StudentStandaloneDetail | null;
  strategy_follow_note: string;
  live_coach_note: string;
}

export interface AdminStudentReportCardsResponse {
  students: AdminStudentReportCardSummary[];
}

export interface AdminStudentReportPdfBundle {
  report: AdminStudentReportCardDetail;
  trends: StudentLearningTrendsResponse;
  time_strategy?: StudentAttemptTimeStrategyResponse | null;
  accuracy_improvement?: StudentAttemptAccuracyImprovementResponse | null;
}
