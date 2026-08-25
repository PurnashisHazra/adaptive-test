import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { startTest } from "../api/client";
import { useHasTestSessionHydrated, useTestSession } from "../store/testSession";

export function TestInstructionsPage() {
  const nav = useNavigate();
  const pending = useTestSession((s) => s.pendingStart);
  const hydrateStart = useTestSession((s) => s.hydrateStart);
  const clearPendingStart = useTestSession((s) => s.clearPendingStart);
  const sessionReady = useHasTestSessionHydrated();

  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!sessionReady) {
    return <div className="page">Loading…</div>;
  }

  if (!pending) {
    return <Navigate to="/take-test" replace />;
  }
  const pendingStart = pending;

  async function onBegin(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) {
      toast.error("Please agree to continue.");
      return;
    }
    setLoading(true);
    try {
      const res = await startTest({
        student_name: pendingStart.studentName,
        subject: pendingStart.subject,
        topic: pendingStart.topic,
        exam_tag: pendingStart.exam_tag?.trim() || undefined,
        total_questions: pendingStart.totalQuestions,
        time_limit_seconds: pendingStart.timeLimitSeconds,
      });
      hydrateStart({
        attemptId: res.attempt_id,
        studentName: pendingStart.studentName,
        totalQuestions: res.total_questions,
        question: res.question,
        questionIndex: res.question_index,
        timeLimitSeconds: res.time_limit_seconds,
        startedAt: res.started_at,
        markedForReview: res.marked_for_review ?? [],
        questionsAnswered: res.questions_answered ?? 0,
        maxReachableIndex: res.max_reachable_index ?? 1,
        attemptFilters: res.attempt_filters ?? undefined,
      });
      clearPendingStart();
      nav("/test");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not start test");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1>General Instructions</h1>
      <div className="card" style={{ marginTop: "1rem" }}>
        <ol style={{ marginTop: 0, lineHeight: 1.7 }}>
          <li>Read each question carefully before choosing your answer.</li>
          <li>Difficulty adapts as you answer; focus on accuracy, not guessing.</li>
          <li>Do not refresh or close the tab during an active test.</li>
          <li>Timer (if enabled) continues until test completion.</li>
          <li>Once submitted, an answer cannot be changed.</li>
        </ol>
        <p style={{ color: "var(--muted)", marginTop: "0.75rem" }}>
          Candidate: <strong>{pendingStart.studentName}</strong> · Questions: <strong>{pendingStart.totalQuestions}</strong>
          {pendingStart.topic ? (
            <>
              {" "}
              · Topic: <strong>{pendingStart.topic}</strong>
            </>
          ) : null}
          {pendingStart.exam_tag ? (
            <>
              {" "}
              · Exam: <strong>{pendingStart.exam_tag}</strong>
            </>
          ) : null}
        </p>
        <form onSubmit={onBegin} style={{ marginTop: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I have read the instructions and I agree to proceed.</span>
          </label>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-primary" disabled={!agree || loading}>
              {loading ? "Starting…" : "Begin Test"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => nav("/take-test")}>
              Back
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

