import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { ChallengesHomePage } from "./pages/ChallengesHomePage";
import { StudentDashboardPage } from "./pages/StudentDashboardPage";
import { StudentTakeTestPage } from "./pages/StudentTakeTestPage";
import { TestInstructionsPage } from "./pages/TestInstructionsPage";
import { TestSessionPage } from "./pages/TestSessionPage";
import { TestResultPage } from "./pages/TestResultPage";
import { StudentHistoryPage } from "./pages/StudentHistoryPage";
import { AdminLayout } from "./components/AdminLayout";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { QuestionsPage } from "./pages/admin/QuestionsPage";
import { QuestionFormPage } from "./pages/admin/QuestionFormPage";
import { BulkUploadPage } from "./pages/admin/BulkUploadPage";
import { AnalyticsPage } from "./pages/admin/AnalyticsPage";
import { AttemptsPage } from "./pages/admin/AttemptsPage";
import { SettingsPage } from "./pages/admin/SettingsPage";
import { QuestionPapersPage } from "./pages/admin/QuestionPapersPage";
import { QuestionPaperFormPage } from "./pages/admin/QuestionPaperFormPage";
import { ChallengesPage } from "./pages/admin/ChallengesPage";
import { ChallengeFormPage } from "./pages/admin/ChallengeFormPage";
import { QuestionReportsPage } from "./pages/admin/QuestionReportsPage";
import { AdminMentorshipBookingsPage } from "./pages/admin/AdminMentorshipBookingsPage";
import { AdminPaperUnlocksPage } from "./pages/admin/AdminPaperUnlocksPage";
import { AdminLeaderConnectPage } from "./pages/admin/AdminLeaderConnectPage";
import { AdminConsultationRequestsPage } from "./pages/admin/AdminConsultationRequestsPage";
import { RcSetsPage } from "./pages/admin/RcSetsPage";
import { RcSetFormPage } from "./pages/admin/RcSetFormPage";
import { AdminStudentControlsPage } from "./pages/admin/AdminStudentControlsPage";
import { AdminStudentReportsPage } from "./pages/admin/AdminStudentReportsPage";
import { AuthPage } from "./pages/AuthPage";
import { StudentProfilePage } from "./pages/StudentProfilePage";
import { PublicStudentProfilePage } from "./pages/PublicStudentProfilePage";
import { PapersPage } from "./pages/PapersPage";
import { StudentReviewListPage } from "./pages/StudentReviewListPage";
import { StudentReviewSessionPage } from "./pages/StudentReviewSessionPage";
import { RequireRole } from "./components/RequireRole";
import { StudentProtectedRoute } from "./components/StudentProtectedRoute";
import { ChallengeExamRoute } from "./components/ChallengeExamRoute";
import { SuperAdminLayout } from "./components/SuperAdminLayout";
import { SuperAdminDashboardPage } from "./pages/admin/SuperAdminDashboardPage";
import { CatMockTestPage } from "./pages/seo/CatMockTestPage";
import { SscMockTestPage } from "./pages/seo/SscMockTestPage";
import { BankExamMockTestPage } from "./pages/seo/BankExamMockTestPage";
import { MockTestsHubPage } from "./pages/seo/MockTestsHubPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/challenges" element={<ChallengesHomePage />} />
        <Route path="/mock-tests" element={<MockTestsHubPage />} />
        <Route path="/cat-mock-test" element={<CatMockTestPage />} />
        <Route path="/ssc-mock-test" element={<SscMockTestPage />} />
        <Route path="/bank-exam-mock-test" element={<BankExamMockTestPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/account" element={<Navigate to="/profile" replace />} />
        <Route
          path="/profile"
          element={
            <RequireRole allowedRoles={["student"]} studentRedirectTo="/profile" adminRedirectTo="/admin" superAdminRedirectTo="/super-admin">
              <StudentProfilePage />
            </RequireRole>
          }
        />
        <Route path="/start" element={<Navigate to="/" replace />} />
        <Route
          path="/take-test"
          element={
            <StudentProtectedRoute studentRedirectTo="/take-test">
              <StudentTakeTestPage />
            </StudentProtectedRoute>
          }
        />
        <Route
          path="/instructions"
          element={
            <StudentProtectedRoute requireInstructor={false}>
              <TestInstructionsPage />
            </StudentProtectedRoute>
          }
        />
        <Route
          path="/test"
          element={
            <ChallengeExamRoute>
              <TestSessionPage />
            </ChallengeExamRoute>
          }
        />
        <Route
          path="/result"
          element={
            <ChallengeExamRoute>
              <TestResultPage />
            </ChallengeExamRoute>
          }
        />
        <Route
          path="/history"
          element={
            <StudentProtectedRoute studentRedirectTo="/history">
              <StudentHistoryPage />
            </StudentProtectedRoute>
          }
        />
        <Route
          path="/review"
          element={
            <StudentProtectedRoute studentRedirectTo="/review" requireInstructor={false}>
              <StudentReviewListPage />
            </StudentProtectedRoute>
          }
        />
        <Route
          path="/review/:sessionType/:id"
          element={
            <StudentProtectedRoute studentRedirectTo="/review" requireInstructor={false}>
              <StudentReviewSessionPage />
            </StudentProtectedRoute>
          }
        />
        <Route
          path="/performance"
          element={
            <StudentProtectedRoute studentRedirectTo="/performance" requireInstructor={false}>
              <StudentDashboardPage />
            </StudentProtectedRoute>
          }
        />
        <Route path="/u/:slug" element={<PublicStudentProfilePage />} />
        <Route
          path="/papers"
          element={
            <StudentProtectedRoute studentRedirectTo="/papers">
              <PapersPage />
            </StudentProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole allowedRoles={["admin"]} studentRedirectTo="/" adminRedirectTo="/admin" superAdminRedirectTo="/super-admin">
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="questions" element={<QuestionsPage />} />
          <Route path="questions/new" element={<QuestionFormPage />} />
          <Route path="questions/:id" element={<QuestionFormPage />} />
          <Route path="rc-sets" element={<RcSetsPage />} />
          <Route path="rc-sets/new" element={<RcSetFormPage />} />
          <Route path="rc-sets/:id" element={<RcSetFormPage />} />
          <Route path="upload" element={<BulkUploadPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="reports" element={<QuestionReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="attempts" element={<AttemptsPage />} />
          <Route path="students" element={<AdminStudentControlsPage />} />
          <Route path="mentorship-bookings" element={<AdminMentorshipBookingsPage />} />
          <Route path="paper-unlocks" element={<AdminPaperUnlocksPage />} />
          <Route path="leader-connect" element={<AdminLeaderConnectPage />} />
          <Route path="consultation-requests" element={<AdminConsultationRequestsPage />} />
          <Route path="student-reports" element={<AdminStudentReportsPage />} />
          <Route path="question-papers" element={<QuestionPapersPage />} />
          <Route path="question-papers/new" element={<QuestionPaperFormPage />} />
          <Route path="question-papers/:id" element={<QuestionPaperFormPage />} />
          <Route path="challenges" element={<ChallengesPage />} />
          <Route path="challenges/new" element={<ChallengeFormPage />} />
          <Route path="challenges/:id" element={<ChallengeFormPage />} />
        </Route>
        <Route
          path="/super-admin"
          element={
            <RequireRole allowedRoles={["super_admin"]} studentRedirectTo="/" adminRedirectTo="/admin" superAdminRedirectTo="/super-admin">
              <SuperAdminLayout />
            </RequireRole>
          }
        >
          <Route index element={<SuperAdminDashboardPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
