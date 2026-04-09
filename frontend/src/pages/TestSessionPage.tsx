import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  endPaperAttempt,
  endTest,
  getQuestionAt,
  patchMarkReview,
  submitAnswer,
  submitQuestionReport,
  timeoutPaperSection,
} from "../api/client";
import type { PaperNextSection } from "../api/types";
import { QuestionNumpad } from "../components/QuestionNumpad";
import { useTestSession } from "../store/testSession";

export function TestSessionPage() {
  const nav = useNavigate();
  const attemptId = useTestSession((s) => s.attemptId);
  const question = useTestSession((s) => s.question);
  const currentIndex = useTestSession((s) => s.currentIndex);
  const totalQuestions = useTestSession((s) => s.totalQuestions);
  const setAfterSubmit = useTestSession((s) => s.setAfterSubmit);
  const applyNavigate = useTestSession((s) => s.applyNavigate);
  const applyPaperNext = useTestSession((s) => s.applyPaperNext);
  const setMarkedForReview = useTestSession((s) => s.setMarkedForReview);
  const setLastPaperSummary = useTestSession((s) => s.setLastPaperSummary);
  const timeLimitSeconds = useTestSession((s) => s.timeLimitSeconds);
  const startedAt = useTestSession((s) => s.startedAt);
  const questionsAnswered = useTestSession((s) => s.questionsAnswered);
  const maxReachableIndex = useTestSession((s) => s.maxReachableIndex);
  const markedForReview = useTestSession((s) => s.markedForReview);
  const canSubmit = useTestSession((s) => s.canSubmit);
  const paperMeta = useTestSession((s) => s.paperMeta);
  const paperAttemptId = useTestSession((s) => s.paperAttemptId);
  const sectionStartedAt = useTestSession((s) => s.sectionStartedAt);

  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sectionElapsed, setSectionElapsed] = useState(0);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);
  const [sectionTimingOut, setSectionTimingOut] = useState(false);
  const [pendingSectionNext, setPendingSectionNext] = useState<PaperNextSection | null>(null);
  const [sectionGateReason, setSectionGateReason] = useState<"submit" | "timeout" | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const questionShownAtMs = useRef<number>(Date.now());
  const draftByIndex = useRef<Record<number, string>>({});
  const timeoutOnce = useRef(false);

  useEffect(() => {
    questionShownAtMs.current = Date.now();
  }, [question?.id]);

  useEffect(() => {
    timeoutOnce.current = false;
  }, [sectionStartedAt, paperMeta?.section_index]);

  useEffect(() => {
    if (!startedAt || !timeLimitSeconds || paperMeta) return;
    const start = new Date(startedAt).getTime();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt, timeLimitSeconds, paperMeta]);

  useEffect(() => {
    if (!paperMeta || !sectionStartedAt || !timeLimitSeconds) return;
    const start = new Date(sectionStartedAt).getTime();
    const id = window.setInterval(() => {
      setSectionElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [paperMeta, sectionStartedAt, timeLimitSeconds]);

  const remaining = useMemo(() => {
    if (!timeLimitSeconds || paperMeta) return null;
    return Math.max(0, timeLimitSeconds - elapsed);
  }, [timeLimitSeconds, elapsed, paperMeta]);

  const sectionRemaining = useMemo(() => {
    if (!paperMeta || !timeLimitSeconds) return null;
    return Math.max(0, timeLimitSeconds - sectionElapsed);
  }, [paperMeta, timeLimitSeconds, sectionElapsed]);

  useEffect(() => {
    if (pendingSectionNext) return;
    if (!paperMeta || !paperAttemptId || sectionRemaining == null || sectionRemaining > 0) return;
    if (timeoutOnce.current || sectionTimingOut) return;
    timeoutOnce.current = true;
    setSectionTimingOut(true);
    (async () => {
      try {
        const res = await timeoutPaperSection(paperAttemptId);
        if (res.paper_summary) {
          setLastPaperSummary(res.paper_summary);
          nav("/result");
          return;
        }
        if (res.paper_next) {
          setPendingSectionNext(res.paper_next);
          setSectionGateReason("timeout");
          setSelected(null);
          draftByIndex.current = {};
        }
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
        toast.error(typeof msg === "string" ? msg : "Section timeout failed");
      } finally {
        setSectionTimingOut(false);
      }
    })();
  }, [sectionRemaining, paperMeta, paperAttemptId, setLastPaperSummary, nav, pendingSectionNext]);

  function onStartNextSection() {
    if (!pendingSectionNext) return;
    applyPaperNext(pendingSectionNext);
    setPendingSectionNext(null);
    setSectionGateReason(null);
    setSelected(null);
    draftByIndex.current = {};
    questionShownAtMs.current = Date.now();
  }

  if (paperMeta && pendingSectionNext) {
    const completedN = paperMeta.section_index + 1;
    const nextN = pendingSectionNext.paper.section_index + 1;
    const nextTitle = pendingSectionNext.paper.section_title;
    return (
      <div className="page" style={{ maxWidth: 520, margin: "0 auto", paddingTop: "2rem" }}>
        <div className="card" style={{ textAlign: "center", padding: "2rem 1.5rem" }}>
          <p style={{ color: "var(--muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: "0.75rem", marginBottom: "0.75rem" }}>
            Question paper
          </p>
          <h1 style={{ fontSize: "1.75rem", lineHeight: 1.2, marginBottom: "0.5rem" }}>Section {completedN} completed</h1>
          <p style={{ color: "var(--muted)", marginBottom: "1.25rem" }}>{paperMeta.section_title}</p>
          {sectionGateReason === "timeout" ? (
            <p style={{ fontSize: "0.95rem", marginBottom: "1.5rem" }}>Time ran out for this section. When you are ready, continue to the next part.</p>
          ) : (
            <p style={{ fontSize: "0.95rem", marginBottom: "1.5rem" }}>Take a short break if you need one. Start the next section when you are ready.</p>
          )}
          <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
            Next: <strong style={{ color: "var(--foreground, inherit)" }}>Section {nextN}</strong>
            {nextTitle ? ` · ${nextTitle}` : ""}
          </p>
          <button type="button" className="btn btn-primary" style={{ minWidth: 220 }} onClick={onStartNextSection}>
            Start section {nextN}
          </button>
        </div>
      </div>
    );
  }

  if (!attemptId || !question) {
    return <Navigate to="/start" replace />;
  }

  const stableAttemptId = attemptId;
  const currentQuestion = question;

  async function goToQuestion(idx: number) {
    if (idx < 1 || idx > maxReachableIndex) return;
    if (idx === currentIndex) return;
    setLoadingIndex(idx);
    try {
      const res = await getQuestionAt(stableAttemptId, idx);
      applyNavigate({
        question: res.question,
        questionIndex: res.question_index,
        questionsAnswered: res.questions_answered,
        maxReachableIndex: res.max_reachable_index,
        markedForReview: res.marked_for_review,
        canSubmit: res.can_submit,
      });
      if (res.can_submit) {
        setSelected(draftByIndex.current[idx] ?? null);
      } else {
        setSelected(res.chosen_answer ?? null);
      }
      questionShownAtMs.current = Date.now();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not open question");
    } finally {
      setLoadingIndex(null);
    }
  }

  async function onSubmitReport() {
    if (!stableAttemptId || !currentQuestion) return;
    setReportSending(true);
    try {
      await submitQuestionReport({
        attempt_id: stableAttemptId,
        question_id: currentQuestion.id,
        question_index: currentIndex,
        message: reportMessage.trim() || undefined,
      });
      toast.success("Report sent. An administrator can review it under Reports.");
      setShowReportModal(false);
      setReportMessage("");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not send report");
    } finally {
      setReportSending(false);
    }
  }

  async function onToggleMarkReview() {
    if (loadingIndex != null) return;
    const marked = markedForReview.includes(currentIndex);
    try {
      const res = await patchMarkReview(stableAttemptId, {
        question_index: currentIndex,
        marked: !marked,
      });
      setMarkedForReview(res.marked_for_review);
    } catch {
      toast.error("Could not update mark for review");
    }
  }

  async function onEndTest() {
    const msg = paperMeta
      ? "End this question paper now? Your scored attempts so far will be kept. You cannot continue this paper later."
      : "Are you sure you want to end the test now? Your answers so far will be saved, and you will not be able to continue this attempt.";
    const ok = window.confirm(msg);
    if (!ok) return;
    setEnding(true);
    try {
      if (paperMeta && paperAttemptId) {
        const summary = await endPaperAttempt(paperAttemptId);
        setLastPaperSummary(summary);
        nav("/result");
        return;
      }
      const summary = await endTest(stableAttemptId);
      setAfterSubmit({
        nextQuestion: null,
        questionIndex: null,
        summary,
      });
      nav("/result");
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof detail === "string" ? detail : "Could not end");
    } finally {
      setEnding(false);
    }
  }

  const isTita = currentQuestion.question_type === "tita";

  async function onSubmit() {
    if (isTita) {
      if (selected == null || !selected.trim()) {
        toast.error("Enter your answer");
        return;
      }
    } else if (selected == null) {
      toast.error("Select an answer");
      return;
    }
    if (!canSubmit) {
      toast.error("You can only submit on the current active question");
      return;
    }
    setSubmitting(true);
    try {
      const secondsOnQuestion = Math.max(0, Math.floor((Date.now() - questionShownAtMs.current) / 1000));
      const res = await submitAnswer(stableAttemptId, {
        question_id: currentQuestion.id,
        chosen_answer: selected,
        elapsed_seconds: secondsOnQuestion,
      });
      delete draftByIndex.current[currentIndex];

      if (res.paper_summary) {
        setLastPaperSummary(res.paper_summary);
        nav("/result");
        return;
      }
      if (res.paper_next) {
        setPendingSectionNext(res.paper_next);
        setSectionGateReason("submit");
        setSelected(null);
        return;
      }

      if (res.completed && res.summary) {
        setAfterSubmit({
          nextQuestion: null,
          questionIndex: null,
          summary: res.summary,
          markedForReview: res.marked_for_review,
          questionsAnswered: res.questions_answered,
          maxReachableIndex: res.max_reachable_index,
        });
        nav("/result");
        return;
      }
      if (!res.next_question) {
        toast.error("Unexpected response from server");
        return;
      }
      setSelected(null);
      setAfterSubmit({
        nextQuestion: res.next_question,
        questionIndex: res.question_index ?? currentIndex + 1,
        summary: null,
        markedForReview: res.marked_for_review,
        questionsAnswered: res.questions_answered,
        maxReachableIndex: res.max_reachable_index,
      });
      questionShownAtMs.current = Date.now();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : undefined;
      toast.error(typeof msg === "string" ? msg : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const progress = totalQuestions > 0 ? (questionsAnswered / totalQuestions) * 100 : 0;
  const optionsDisabled = !canSubmit || loadingIndex != null || sectionTimingOut;

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {paperMeta ? (
            <span className="badge">
              {paperMeta.paper_title} · {paperMeta.section_title} ({paperMeta.section_index + 1}/{paperMeta.total_sections})
            </span>
          ) : (
            <span className="badge">
              Question {currentIndex} of {totalQuestions}
            </span>
          )}
          <button
            type="button"
            className="btn btn-danger"
            onClick={onEndTest}
            disabled={submitting || ending || loadingIndex != null || sectionTimingOut}
          >
            {ending ? "Ending…" : paperMeta ? "End question paper" : "End test"}
          </button>
        </div>
        {paperMeta && sectionRemaining != null ? (
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: "0.95rem",
              color: sectionRemaining < 120 ? "var(--danger)" : "var(--muted)",
            }}
          >
            Section: {Math.floor(sectionRemaining / 60)}:{String(sectionRemaining % 60).padStart(2, "0")}
          </span>
        ) : remaining != null ? (
          <span style={{ fontFamily: "var(--mono)", fontSize: "0.95rem", color: remaining < 120 ? "var(--danger)" : "var(--muted)" }}>
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </span>
        ) : null}
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "#e2e8f0", overflow: "hidden", marginBottom: "1.5rem" }}>
        <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg, var(--primary), var(--accent))", transition: "width 0.35s ease" }} />
      </div>
      <div className="test-session-layout" style={{ display: "grid", gap: "1.5rem", alignItems: "start" }}>
        <div className="card" style={{ margin: 0 }}>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            {currentQuestion.subject} · {currentQuestion.topic}
          </p>
          <h2 style={{ fontSize: "1.35rem", marginBottom: "1.25rem" }}>{currentQuestion.question_text}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {isTita ? (
              <input
                type="text"
                className="input"
                autoComplete="off"
                placeholder="Type your answer"
                value={selected ?? ""}
                disabled={optionsDisabled}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelected(v);
                  if (canSubmit) draftByIndex.current[currentIndex] = v;
                }}
                style={{ fontSize: "1.05rem", padding: "0.75rem 0.85rem" }}
              />
            ) : (
              currentQuestion.options.map((o) => (
                <label
                  key={o.key}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.65rem",
                    padding: "0.75rem 0.85rem",
                    borderRadius: 10,
                    border: selected === o.key ? "2px solid var(--primary)" : "1px solid var(--border)",
                    cursor: optionsDisabled ? "default" : "pointer",
                    background: selected === o.key ? "rgba(14,165,233,0.08)" : "#fff",
                    opacity: optionsDisabled ? 0.92 : 1,
                  }}
                >
                  <input
                    type="radio"
                    name="opt"
                    checked={selected === o.key}
                    disabled={optionsDisabled}
                    onChange={() => {
                      setSelected(o.key);
                      if (canSubmit) draftByIndex.current[currentIndex] = o.key;
                    }}
                    style={{ marginTop: 4 }}
                  />
                  <span>{o.label}</span>
                </label>
              ))
            )}
          </div>
          {!canSubmit && (
            <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--muted)" }}>You are reviewing a submitted answer. Only the active question can be changed.</p>
          )}
          <div style={{ marginTop: "1.25rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSubmit}
              disabled={
                submitting ||
                !canSubmit ||
                loadingIndex != null ||
                sectionTimingOut ||
                (isTita ? !selected?.trim() : selected == null)
              }
              style={{ minWidth: 160 }}
            >
              {submitting ? "Checking…" : "Submit answer"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onToggleMarkReview} disabled={loadingIndex != null || sectionTimingOut}>
              {markedForReview.includes(currentIndex) ? "Unmark review" : "Mark for review"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowReportModal(true)}
              disabled={loadingIndex != null || sectionTimingOut}
              title="Flag a typo, wrong answer key, or unclear wording"
            >
              Report question
            </button>
          </div>
        </div>

        <QuestionNumpad
          totalQuestions={totalQuestions}
          currentIndex={currentIndex}
          maxReachableIndex={maxReachableIndex}
          questionsAnswered={questionsAnswered}
          markedForReview={markedForReview}
          loadingIndex={loadingIndex}
          onSelect={goToQuestion}
        />
      </div>

      {showReportModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: "1rem",
          }}
          onClick={() => !reportSending && setShowReportModal(false)}
        >
          <div className="card" style={{ width: "min(480px, 96vw)", margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Report this question</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.92rem", marginTop: "-0.25rem" }}>
              Tell us what is wrong (optional). Your attempt and question are recorded for administrators.
            </p>
            <label className="label" style={{ marginTop: "0.75rem" }}>
              Details
            </label>
            <textarea
              className="input"
              rows={4}
              value={reportMessage}
              onChange={(e) => setReportMessage(e.target.value)}
              placeholder="e.g. Option B should be marked correct, or there is a typo in the stem…"
              disabled={reportSending}
            />
            <div style={{ display: "flex", gap: "0.6rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" onClick={onSubmitReport} disabled={reportSending}>
                {reportSending ? "Sending…" : "Submit report"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowReportModal(false)} disabled={reportSending}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
