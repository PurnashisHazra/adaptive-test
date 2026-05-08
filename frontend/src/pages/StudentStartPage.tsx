import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { getConfig, getTestTopics } from "../api/client";
import { useTestSession } from "../store/testSession";

export function StudentStartPage() {
  const nav = useNavigate();
  const setPendingStart = useTestSession((s) => s.setPendingStart);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [total, setTotal] = useState(10);
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof getConfig>> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getConfig()
      .then((c) => {
        setCfg(c);
        setTotal(c.default_test_question_count);
      })
      .catch(() => toast.error("Could not load settings"));
  }, []);

  useEffect(() => {
    if (!cfg?.topic_filter_enabled) return;
    let alive = true;
    setLoadingTopics(true);
    getTestTopics(cfg?.subject_filter_enabled ? subject.trim() || undefined : undefined)
      .then((ts) => {
        if (!alive) return;
        setTopics(ts);
        if (topic && !ts.includes(topic)) {
          setTopic("");
        }
      })
      .catch(() => {
        if (!alive) return;
        setTopics([]);
      })
      .finally(() => {
        if (alive) setLoadingTopics(false);
      });
    return () => {
      alive = false;
    };
  }, [cfg?.topic_filter_enabled, cfg?.subject_filter_enabled, subject]);

  async function onStart(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    setLoading(true);
    try {
      setPendingStart({
        studentName: name.trim(),
        subject: cfg?.subject_filter_enabled ? subject.trim() || undefined : undefined,
        topic: cfg?.topic_filter_enabled ? topic.trim() || undefined : undefined,
        totalQuestions: total,
        timeLimitSeconds: cfg?.default_time_limit_seconds,
      });
      nav("/instructions");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1>Begin your session</h1>
      <p style={{ color: "var(--muted)" }}>Your name is used to group attempts — no password in this MVP.</p>
      <form onSubmit={onStart} className="card" style={{ marginTop: "1.5rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Display name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required />
        </div>
        {cfg?.subject_filter_enabled && (
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Subject (optional)</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mathematics" />
          </div>
        )}
        {cfg?.topic_filter_enabled && (
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Topic (optional)</label>
            <select className="input" value={topic} onChange={(e) => setTopic(e.target.value)} disabled={loadingTopics}>
              <option value="">Any topic</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
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
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Starting…" : "Start adaptive test"}
        </button>
      </form>
    </div>
  );
}
