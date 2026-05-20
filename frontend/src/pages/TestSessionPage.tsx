import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  endChallengeAttempt,
  endPaperAttempt,
  endTest,
  getMyCoachPlan,
  getQuestionAt,
  patchMarkReview,
  postCoachExplanationHint,
  submitAnswer,
  submitQuestionReport,
  timeoutChallengeSection,
  timeoutPaperSection,
} from "../api/client";
import type { PaperNextSection, StudentCoachPlanBundle } from "../api/types";
import { computeCoachLiveAdvice } from "../lib/coachHints";
import { QuestionNumpad } from "../components/QuestionNumpad";
import { useTestSession } from "../store/testSession";

function formatCountdown(totalSeconds: number) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
  const structuredKind = useTestSession((s) => s.structuredKind);
  const sectionStartedAt = useTestSession((s) => s.sectionStartedAt);
  const attemptFilters = useTestSession((s) => s.attemptFilters);
  const studentName = useTestSession((s) => s.studentName);

  const isQuestionPaperSession = Boolean(paperMeta || paperAttemptId);

  const [coachPlan, setCoachPlan] = useState<StudentCoachPlanBundle | null>(null);
  const [secondsOnQuestion, setSecondsOnQuestion] = useState(0);

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
  const explanationHintFetchedForQid = useRef<string | null>(null);

  const [explanationHint, setExplanationHint] = useState<string | null>(null);
  const [explanationHintLoading, setExplanationHintLoading] = useState(false);
  const [explanationHintError, setExplanationHintError] = useState<string | null>(null);

  useEffect(() => {
    questionShownAtMs.current = Date.now();
  }, [question?.id]);

  useEffect(() => {
    setSecondsOnQuestion(0);
    setExplanationHint(null);
    setExplanationHintError(null);
    setExplanationHintLoading(false);
    explanationHintFetchedForQid.current = null;
  }, [question?.id]);

  useEffect(() => {
    if (isQuestionPaperSession || !question?.id) return;
    const tick = () => {
      setSecondsOnQuestion(Math.max(0, Math.floor((Date.now() - questionShownAtMs.current) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isQuestionPaperSession, question?.id]);

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
        const res =
          structuredKind === "challenge"
            ? await timeoutChallengeSection(paperAttemptId)
            : await timeoutPaperSection(paperAttemptId);
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

  useEffect(() => {
    if (isQuestionPaperSession) {
      setCoachPlan(null);
    }
  }, [isQuestionPaperSession]);

  useEffect(() => {
    if (!attemptId || isQuestionPaperSession) return;
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!token) {
      setCoachPlan(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const plan = await getMyCoachPlan({
          subject: attemptFilters?.subject ?? undefined,
          topic: attemptFilters?.topic ?? undefined,
          exam_tag: attemptFilters?.exam_tag ?? undefined,
        });
        if (!cancelled) setCoachPlan(plan);
      } catch {
        if (!cancelled) setCoachPlan(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId, isQuestionPaperSession, attemptFilters?.subject, attemptFilters?.topic, attemptFilters?.exam_tag]);

  const coachLive = useMemo(() => {
    if (isQuestionPaperSession || !question) return null;
    return computeCoachLiveAdvice({
      secondsOnQuestion,
      currentIndex,
      totalQuestions,
      testElapsedSeconds: elapsed,
      difficulty: question.difficulty,
      questionType: question.question_type,
      plan: coachPlan,
      questionSubject: question.subject,
      questionTopic: question.topic,
      questionStem: question.question_text,
    });
  }, [
    isQuestionPaperSession,
    question?.id,
    question?.subject,
    question?.topic,
    question?.question_text,
    question?.difficulty,
    question?.question_type,
    secondsOnQuestion,
    currentIndex,
    totalQuestions,
    elapsed,
    coachPlan,
  ]);

  useEffect(() => {
    if (isQuestionPaperSession || !attemptId || !question?.id || !canSubmit) return;
    if (secondsOnQuestion < 10) return;
    if (explanationHintFetchedForQid.current === question.id) return;
    explanationHintFetchedForQid.current = question.id;
    let cancelled = false;
    setExplanationHintLoading(true);
    setExplanationHintError(null);
    postCoachExplanationHint(attemptId, { question_id: question.id })
      .then((res) => {
        if (cancelled) return;
        if (res.hint?.trim()) {
          setExplanationHint(res.hint.trim());
        } else if (res.error) {
          setExplanationHintError(res.error);
        }
      })
      .catch(() => {
        if (!cancelled) setExplanationHintError("Could not load explanation hint.");
      })
      .finally(() => {
        if (!cancelled) setExplanationHintLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isQuestionPaperSession, attemptId, question?.id, canSubmit, secondsOnQuestion]);

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
      <div className="page" style={{ margin: "0 auto", paddingTop: "2rem" }}>
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
    return <Navigate to="/" replace />;
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

  async function onMarkReviewAndNext() {
    if (loadingIndex != null || sectionTimingOut) return;
    if (!markedForReview.includes(currentIndex)) {
      try {
        const res = await patchMarkReview(stableAttemptId, {
          question_index: currentIndex,
          marked: true,
        });
        setMarkedForReview(res.marked_for_review);
      } catch {
        toast.error("Could not update mark for review");
        return;
      }
    }
    if (currentIndex < maxReachableIndex) {
      await goToQuestion(currentIndex + 1);
    }
  }

  function onClearResponse() {
    if (!canSubmit || loadingIndex != null || sectionTimingOut) return;
    setSelected(null);
    delete draftByIndex.current[currentIndex];
  }

  async function onEndTest() {
    const msg = paperMeta
      ? structuredKind === "challenge"
        ? "End this challenge now? Your scored attempts so far will be kept. You cannot continue this challenge later."
        : "End this question paper now? Your scored attempts so far will be kept. You cannot continue this paper later."
      : "Are you sure you want to end the test now? Your answers so far will be saved, and you will not be able to continue this attempt.";
    const ok = window.confirm(msg);
    if (!ok) return;
    setEnding(true);
    try {
      if (paperMeta && paperAttemptId) {
        const summary =
          structuredKind === "challenge"
            ? (await endChallengeAttempt(paperAttemptId)).paper_summary
            : await endPaperAttempt(paperAttemptId);
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

  const headerTabs = useMemo(() => {
    if (paperMeta) {
      return Array.from({ length: paperMeta.total_sections }, (_, i) => ({
        key: `sec-${i}`,
        label: `S${i + 1}`,
        active: i === paperMeta.section_index,
        title:
          i === paperMeta.section_index && paperMeta.section_title
            ? paperMeta.section_title
            : `Section ${i + 1}`,
      }));
    }
    const raw = [attemptFilters?.subject, attemptFilters?.topic, attemptFilters?.exam_tag].filter(
      (x): x is string => Boolean(x?.trim())
    );
    const labels = raw.length > 0 ? raw : ["Adaptive"];
    const subj = currentQuestion.subject?.trim();
    const topic = currentQuestion.topic?.trim();
    let activePos = labels.findIndex((l) => l === subj);
    if (activePos < 0) activePos = labels.findIndex((l) => l === topic);
    if (activePos < 0) activePos = 0;
    return labels.slice(0, 5).map((label, i) => ({
      key: `fl-${i}`,
      label: label.length > 14 ? `${label.slice(0, 12)}…` : label,
      active: i === activePos,
      title: label,
    }));
  }, [
    paperMeta,
    attemptFilters?.subject,
    attemptFilters?.topic,
    attemptFilters?.exam_tag,
    currentQuestion.subject,
    currentQuestion.topic,
  ]);

  const timerSeconds = sectionRemaining ?? remaining;
  const timerWarn = timerSeconds != null && timerSeconds < 120;
  const sectionStripTitle = paperMeta
    ? paperMeta.section_title || `Section ${paperMeta.section_index + 1}`
    : `${currentQuestion.subject} · ${currentQuestion.topic}`;
  const marksLine = paperMeta
    ? `Marks for correct answer ${paperMeta.marks_per_correct} | Negative marks ${paperMeta.marks_per_incorrect}`
    : "Marks follow your course settings";
  const notVisitedCount = Math.max(0, totalQuestions - maxReachableIndex);
  const pendingInReach = Math.max(0, maxReachableIndex - questionsAnswered);
  const displayName = studentName.trim() || "Student";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 2) || "?";

  return (
    <div className="test-exam-page">
      <header className="test-exam-top">
        <div className="test-exam-tabs" role="tablist" aria-label="Sections">
          {headerTabs.map((t) => (
            <div
              key={t.key}
              role="tab"
              aria-selected={t.active}
              className={["test-exam-tab", t.active ? "test-exam-tab--active" : "test-exam-tab--muted"].join(" ")}
              title={t.title}
            >
              <span>{t.label}</span>
              <span style={{ marginLeft: 4, opacity: 0.65, cursor: "help" }} title={t.title}>
                ⓘ
              </span>
            </div>
          ))}
        </div>
        <div className="test-exam-top-right">
          {timerSeconds != null ? (
            <span className={["test-exam-timer", timerWarn ? "test-exam-timer--warn" : ""].filter(Boolean).join(" ")}>
              Time left: {formatCountdown(timerSeconds)}
            </span>
          ) : (
            <span className="test-exam-timer" style={{ color: "#64748b" }}>
              No timer
            </span>
          )}
          <button type="button" className="test-exam-icon-btn" disabled title="Calculator not available in this build">
            ⌗
          </button>
        </div>
      </header>

      <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em" }}>
        Section
      </p>
      <div className="test-exam-section-bar">
        <button
          type="button"
          className="test-exam-section-bar__nav"
          aria-label="Previous question"
          disabled={currentIndex <= 1 || loadingIndex != null || sectionTimingOut}
          onClick={() => goToQuestion(currentIndex - 1)}
        >
          ‹
        </button>
        <div className="test-exam-section-bar__title">{sectionStripTitle}</div>
        <button
          type="button"
          className="test-exam-section-bar__nav"
          aria-label="Next question"
          disabled={currentIndex >= maxReachableIndex || loadingIndex != null || sectionTimingOut}
          onClick={() => goToQuestion(currentIndex + 1)}
        >
          ›
        </button>
      </div>

      <div className="test-exam-progress">
        <div className="test-exam-progress__fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="test-exam-body">
        <div className="test-exam-main">
          <div className="test-exam-passage">
            <p className="test-exam-passage__label">Information</p>
            {currentQuestion.image_url ? (
              <img src={currentQuestion.image_url} alt="" />
            ) : (
              <p className="test-exam-passage__placeholder">
                Supporting figures or tables appear here when the question includes them. Use the question section below to answer.
              </p>
            )}
            {coachLive ? (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={[
                  "test-exam-coach",
                  coachLive.urgency === "urgent"
                    ? "test-exam-coach--urgent"
                    : coachLive.urgency === "warn"
                      ? "test-exam-coach--warn"
                      : coachLive.urgency === "notice"
                        ? "test-exam-coach--notice"
                        : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b" }}>
                    Live coach
                  </span>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#64748b" }}>{coachLive.secondsOnQuestion}s on this item</span>
                </div>
                <p style={{ margin: "0.35rem 0 0", fontWeight: 700, color: "#0f172a" }}>{coachLive.headline}</p>
                <p style={{ margin: "0.35rem 0 0", color: "#334155" }}>{coachLive.strategyLine}</p>
                {coachLive.secondaryLine ? <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>{coachLive.secondaryLine}</p> : null}
                {coachLive.actionLabel ? (
                  <p style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: "#64748b" }}>Saved plan: {coachLive.actionLabel}</p>
                ) : null}
                {explanationHintLoading ? (
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#64748b", fontStyle: "italic" }}>Generating hint from the question explanation…</p>
                ) : null}
                {explanationHintError && !explanationHint ? (
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#64748b" }}>{explanationHintError}</p>
                ) : null}
                {explanationHint ? (
                  <div style={{ margin: "0.55rem 0 0", paddingTop: "0.5rem", borderTop: "1px solid rgba(15,23,42,0.12)" }}>
                    <p style={{ margin: 0, fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#64748b" }}>
                      Explanation hint
                    </p>
                    <p style={{ margin: "0.3rem 0 0", fontSize: "0.88rem", lineHeight: 1.5, color: "#0f172a" }}>{explanationHint}</p>
                  </div>
                ) : null}
              </div>
            ) : explanationHintLoading || explanationHintError || explanationHint ? (
              <div className="test-exam-coach" role="status" aria-live="polite">
                <p style={{ margin: 0, fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b" }}>
                  Coach hint
                </p>
                {explanationHintLoading ? (
                  <p style={{ margin: "0.45rem 0 0", fontSize: "0.85rem", color: "#64748b", fontStyle: "italic" }}>Generating hint from the question explanation…</p>
                ) : null}
                {explanationHintError && !explanationHint ? (
                  <p style={{ margin: "0.45rem 0 0", fontSize: "0.82rem", color: "#64748b" }}>{explanationHintError}</p>
                ) : null}
                {explanationHint ? (
                  <p style={{ margin: "0.45rem 0 0", fontSize: "0.88rem", lineHeight: 1.5, color: "#0f172a" }}>{explanationHint}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="test-exam-question">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
              <p className="test-exam-marks" style={{ margin: 0, textAlign: "left", flex: 1 }}>
                {marksLine}
              </p>
              <button
                type="button"
                className="test-exam-footer__btn"
                style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                onClick={() => setShowReportModal(true)}
                disabled={loadingIndex != null || sectionTimingOut}
                title="Flag a typo, wrong answer key, or unclear wording"
              >
                Report
              </button>
            </div>
            <h2 className="test-exam-qno">Question No. {currentIndex}</h2>
            <p className="test-exam-stem">{currentQuestion.question_text}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {isTita ? (
                <input
                  type="text"
                  className="test-exam-tita"
                  autoComplete="off"
                  placeholder="Type your answer"
                  value={selected ?? ""}
                  disabled={optionsDisabled}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelected(v);
                    if (canSubmit) draftByIndex.current[currentIndex] = v;
                  }}
                />
              ) : (
                currentQuestion.options.map((o) => (
                  <label
                    key={o.key}
                    className={[
                      "test-exam-option",
                      selected === o.key ? "test-exam-option--selected" : "",
                      optionsDisabled ? "test-exam-option--disabled" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
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
                    />
                    <span>{o.label}</span>
                  </label>
                ))
              )}
            </div>
            {!canSubmit ? (
              <p className="test-exam-review-note">You are reviewing a submitted answer. Only the active question can be changed.</p>
            ) : null}
          </div>
        </div>

        <aside className="test-exam-sidebar">
          <div className="test-exam-profile">
            <div className="test-exam-avatar" aria-hidden>
              {initials}
            </div>
            <div className="test-exam-profile__name" title={displayName}>
              {displayName}
            </div>
          </div>
          <div className="test-exam-legend-counts" aria-label="Question status summary">
            <span>
              <span>Answered</span>
              <strong>{questionsAnswered}</strong>
            </span>
            <span>
              <span>Not answered (in reach)</span>
              <strong>{pendingInReach}</strong>
            </span>
            <span>
              <span>Not visited</span>
              <strong>{notVisitedCount}</strong>
            </span>
            <span>
              <span>Marked for review</span>
              <strong>{markedForReview.length}</strong>
            </span>
          </div>
          <QuestionNumpad
            totalQuestions={totalQuestions}
            currentIndex={currentIndex}
            maxReachableIndex={maxReachableIndex}
            questionsAnswered={questionsAnswered}
            markedForReview={markedForReview}
            loadingIndex={loadingIndex}
            onSelect={goToQuestion}
            embedded
            compact
          />
          <button
            type="button"
            className="test-exam-footer__btn"
            style={{ width: "100%", fontSize: "0.78rem", padding: "0.45rem" }}
            onClick={onToggleMarkReview}
            disabled={loadingIndex != null || sectionTimingOut}
          >
            {markedForReview.includes(currentIndex) ? "Unmark review" : "Mark for review only"}
          </button>
          <button
            type="button"
            className="test-exam-submit-sidebar"
            style={{ marginTop: "auto" }}
            onClick={onEndTest}
            disabled={submitting || ending || loadingIndex != null || sectionTimingOut}
          >
            {ending ? "Ending…" : paperMeta ? "Submit paper" : "Submit test"}
          </button>
        </aside>
      </div>

      <footer className="test-exam-footer">
        <div className="test-exam-footer__left">
          <button type="button" className="test-exam-footer__btn" onClick={onMarkReviewAndNext} disabled={loadingIndex != null || sectionTimingOut}>
            Mark for review &amp; next
          </button>
          <button type="button" className="test-exam-footer__btn" onClick={onClearResponse} disabled={!canSubmit || loadingIndex != null || sectionTimingOut}>
            Clear response
          </button>
        </div>
        <div className="test-exam-footer__right">
          <button
            type="button"
            className="test-exam-footer__btn test-exam-footer__btn--primary"
            onClick={onSubmit}
            disabled={
              submitting || !canSubmit || loadingIndex != null || sectionTimingOut || (isTita ? !selected?.trim() : selected == null)
            }
          >
            {submitting ? "Checking…" : "Save & next"}
          </button>
        </div>
      </footer>

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
