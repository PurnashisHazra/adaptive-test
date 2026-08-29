import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { getConfig, getMySessionControls, getTestExamCategories, getTestTopics, requestMorePracticeAttempts } from "../api/client";
import type { StudentSessionControls } from "../api/types";
import { examTagLabel } from "../components/QuestionBankFolderGrid";
import { useAuthStore } from "../store/authStore";
import { useTestSession } from "../store/testSession";
import { AppPage } from "../components/AppPage";

export function StudentTakeTestPage() {
  const nav = useNavigate();
  const setPendingStart = useTestSession((s) => s.setPendingStart);
  const authUsername = useAuthStore((s) => s.session?.username ?? "");

  const [controls, setControls] = useState<StudentSessionControls | null>(null);
  const [loadingControls, setLoadingControls] = useState(true);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [examCategories, setExamCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(10);
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof getConfig>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [examTag, setExamTag] = useState("");

  const reloadControls = () => {
    return getMySessionControls().then(setControls).catch(() => toast.error("Could not refresh settings"));
  };

  const allowedExams = controls?.allowed_exam_tags ?? [];
  const examRestricted = allowedExams.length > 0;
  const nameLocked = Boolean(controls?.display_name);
  const examOptions = examRestricted ? allowedExams : examCategories;
  const examSelected = examTag.trim().length > 0;
  const topicSelected = topic.trim().length > 0;
  const noQuestionsForSelection = examSelected && !loadingTopics && topics.length === 0;

  useEffect(() => {
    let alive = true;
    setLoadingControls(true);
    getMySessionControls()
      .then((c) => {
        if (!alive) return;
        setControls(c);
        setName(c.display_name);
        if (c.allowed_exam_tags.length === 1) {
          setExamTag(c.allowed_exam_tags[0]);
        }
      })
      .catch(() => {
        if (!alive) return;
        toast.error("Could not load your session settings");
      })
      .finally(() => {
        if (alive) setLoadingControls(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    getConfig()
      .then((c) => {
        setCfg(c);
        setTotal(c.default_test_question_count);
      })
      .catch(() => toast.error("Could not load settings"));
  }, []);

  useEffect(() => {
    if (examRestricted) return;
    let alive = true;
    getTestExamCategories()
      .then((tags) => {
        if (!alive) return;
        setExamCategories(tags);
      })
      .catch(() => {
        if (!alive) return;
        setExamCategories([]);
      });
    return () => {
      alive = false;
    };
  }, [examRestricted]);

  useEffect(() => {
    if (!examSelected) {
      setTopics([]);
      setTopic("");
      setLoadingTopics(false);
      return;
    }
    let alive = true;
    setLoadingTopics(true);
    getTestTopics(undefined, examTag.trim())
      .then((ts) => {
        if (!alive) return;
        setTopics(ts);
        setTopic((current) => (current && ts.some((t) => t.toLowerCase() === current.toLowerCase()) ? current : ""));
      })
      .catch(() => {
        if (!alive) return;
        setTopics([]);
        setTopic("");
      })
      .finally(() => {
        if (alive) setLoadingTopics(false);
      });
    return () => {
      alive = false;
    };
  }, [examTag, examSelected]);

  const attemptsHint = useMemo(() => {
    if (!controls) return null;
    if (controls.practice_attempts_unlimited) {
      return `${controls.practice_attempts_used} practice attempt${controls.practice_attempts_used === 1 ? "" : "s"} used · unlimited allowance`;
    }
    if (controls.practice_attempts_allowance == null) return null;
    const rem = controls.practice_attempts_remaining ?? 0;
    return `${controls.practice_attempts_used} of ${controls.practice_attempts_allowance} practice attempt${controls.practice_attempts_allowance === 1 ? "" : "s"} used · ${rem} remaining`;
  }, [controls]);

  async function onRequestMoreAttempts() {
    setRequesting(true);
    try {
      await requestMorePracticeAttempts();
      toast.success("Request sent to your instructor");
      await reloadControls();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not submit request");
    } finally {
      setRequesting(false);
    }
  }

  async function onStart(e: React.FormEvent) {
    e.preventDefault();
    if (!controls?.can_start_practice_test) {
      toast.error(controls?.block_reason ?? "You cannot start a practice test right now");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (!examTag.trim()) {
      toast.error("Select an exam category");
      return;
    }
    if (!topic.trim()) {
      toast.error("Select a topic");
      return;
    }
    if (noQuestionsForSelection) {
      toast.error("Questions not available");
      return;
    }
    setLoading(true);
    try {
      setPendingStart({
        studentName: name.trim(),
        topic: topic.trim(),
        exam_tag: examTag.trim(),
        totalQuestions: total,
        timeLimitSeconds: cfg?.default_time_limit_seconds,
      });
      nav("/instructions");
    } finally {
      setLoading(false);
    }
  }

  if (loadingControls) {
    return (
      <AppPage title="Begin your session" lead="Loading your settings…">
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </AppPage>
    );
  }

  if (controls?.blocked) {
    return (
      <AppPage title="Begin your session">
        <div className="card app-alert app-alert--danger">
          <p>{controls.block_reason ?? "Your account has been blocked from AdapTest. Contact your instructor."}</p>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage
      title="Begin your session"
      lead={
        <>
          Signed in as <strong>{authUsername}</strong>
          {attemptsHint ? <> · {attemptsHint}</> : null}
        </>
      }
    >
      {!controls?.can_start_practice_test ? (
        <div className="card app-alert app-alert--warn">
          <p>
            {controls?.block_reason ?? "You cannot start another practice test."}{" "}
            <Link to="/papers">View assigned question papers</Link> if you have any.
          </p>
          {controls?.can_request_more_attempts ? (
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: "1rem" }}
              disabled={requesting}
              onClick={() => void onRequestMoreAttempts()}
            >
              {requesting ? "Sending request…" : "Request more practice attempts"}
            </button>
          ) : null}
          {controls?.has_pending_practice_request ? (
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.85rem", color: "#b45309" }}>
              Your instructor will be notified. You can start another test after they approve your request.
            </p>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={onStart} className="card app-form-card">
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Display name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={authUsername}
            required
            readOnly={nameLocked}
            style={nameLocked ? { background: "#f8fafc", color: "#475569" } : undefined}
          />
          {nameLocked ? (
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
              Set by your instructor for test sessions.
            </p>
          ) : null}
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Exam category</label>
          <select
            className="input"
            value={examTag}
            onChange={(e) => {
              setExamTag(e.target.value);
              setTopic("");
            }}
            required
          >
            <option value="">Select exam category</option>
            {examOptions.map((tag) => (
              <option key={tag} value={tag}>
                {examTagLabel(tag)}
              </option>
            ))}
          </select>
          {examRestricted ? (
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
              Your instructor limited practice tests to: {allowedExams.map((t) => examTagLabel(t)).join(", ")}.
            </p>
          ) : examOptions.length === 0 ? (
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#b91c1c" }}>Questions not available</p>
          ) : null}
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Topic</label>
          <select
            className="input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={!examSelected || loadingTopics}
            required
          >
            <option value="">
              {!examSelected
                ? "Select exam category first"
                : loadingTopics
                  ? "Loading topics…"
                  : topics.length === 0
                    ? "No topics yet"
                    : "Select topic"}
            </option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {noQuestionsForSelection ? (
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#b91c1c" }}>Questions not available</p>
          ) : null}
        </div>
        <div style={{ marginBottom: "1.25rem" }}>
          <label className="label">Number of questions</label>
          <input
            className="input"
            type="number"
            min={1}
            max={100}
            value={total}
            onChange={(e) => setTotal(Number(e.target.value))}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !controls?.can_start_practice_test || !examSelected || !topicSelected || noQuestionsForSelection}
          style={{ width: "100%" }}
        >
          {loading ? "Starting…" : "Start adaptive test"}
        </button>
      </form>
    </AppPage>
  );
}
