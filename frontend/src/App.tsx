import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LandingPage } from "./pages/LandingPage";
import { StudentStartPage } from "./pages/StudentStartPage";
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
import { QuestionReportsPage } from "./pages/admin/QuestionReportsPage";
import { AuthPage } from "./pages/AuthPage";
import { PapersPage } from "./pages/PapersPage";
import { StudentReviewListPage } from "./pages/StudentReviewListPage";
import { StudentReviewSessionPage } from "./pages/StudentReviewSessionPage";
import { RequireRole } from "./components/RequireRole";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/start"
          element={
            <RequireRole allowedRoles={["student"]} studentRedirectTo="/start" adminRedirectTo="/admin">
              <StudentStartPage />
            </RequireRole>
          }
        />
        <Route
          path="/instructions"
          element={
            <RequireRole allowedRoles={["student"]} studentRedirectTo="/start" adminRedirectTo="/admin">
              <TestInstructionsPage />
            </RequireRole>
          }
        />
        <Route
          path="/test"
          element={
            <RequireRole allowedRoles={["student"]} studentRedirectTo="/start" adminRedirectTo="/admin">
              <TestSessionPage />
            </RequireRole>
          }
        />
        <Route
          path="/result"
          element={
            <RequireRole allowedRoles={["student"]} studentRedirectTo="/start" adminRedirectTo="/admin">
              <TestResultPage />
            </RequireRole>
          }
        />
        <Route
          path="/history"
          element={
            <RequireRole allowedRoles={["student"]} studentRedirectTo="/history" adminRedirectTo="/admin">
              <StudentHistoryPage />
            </RequireRole>
          }
        />
        <Route
          path="/review"
          element={
            <RequireRole allowedRoles={["student"]} studentRedirectTo="/review" adminRedirectTo="/admin">
              <StudentReviewListPage />
            </RequireRole>
          }
        />
        <Route
          path="/review/:sessionType/:id"
          element={
            <RequireRole allowedRoles={["student"]} studentRedirectTo="/review" adminRedirectTo="/admin">
              <StudentReviewSessionPage />
            </RequireRole>
          }
        />
        <Route
          path="/papers"
          element={
            <RequireRole allowedRoles={["student"]} studentRedirectTo="/papers" adminRedirectTo="/admin">
              <PapersPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole allowedRoles={["admin"]} studentRedirectTo="/start" adminRedirectTo="/admin">
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="questions" element={<QuestionsPage />} />
          <Route path="questions/new" element={<QuestionFormPage />} />
          <Route path="questions/:id" element={<QuestionFormPage />} />
          <Route path="upload" element={<BulkUploadPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="reports" element={<QuestionReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="attempts" element={<AttemptsPage />} />
          <Route path="question-papers" element={<QuestionPapersPage />} />
          <Route path="question-papers/new" element={<QuestionPaperFormPage />} />
          <Route path="question-papers/:id" element={<QuestionPaperFormPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
