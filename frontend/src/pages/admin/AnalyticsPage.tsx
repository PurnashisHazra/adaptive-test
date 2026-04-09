import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AdminPanel } from "../../components/AdminPanel";
import { getAnalytics } from "../../api/client";
import type { AnalyticsOverview, AttemptBreakdown } from "../../api/types";

function formatQuestionTime(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function difficultyRadius(difficulty: string): number {
  switch ((difficulty || "").toUpperCase()) {
    case "EXPERT":
      return 12;
    case "HARD":
      return 10;
    case "MEDIUM":
      return 8;
    case "EASY":
    default:
      return 6;
  }
}

function AttemptChart({ att }: { att: AttemptBreakdown }) {
  const chartW = 760;
  const chartH = 260;
  const padL = 52;
  const padR = 18;
  const padT = 14;
  const padB = 34;
  const steps = att.steps ?? [];
  const maxX = Math.max(1, ...steps.map((s) => s.sequence));
  const maxY = Math.max(5, ...steps.map((s) => s.time_spent_seconds ?? 0));
  const xToPx = (x: number) => padL + ((x - 1) / Math.max(1, maxX - 1)) * (chartW - padL - padR);
  const yToPx = (y: number) => chartH - padB - (y / maxY) * (chartH - padT - padB);
  return (
    <div className="table-wrap" style={{ overflowX: "auto", paddingBottom: "0.25rem" }}>
      <svg
        width={chartW}
        height={chartH}
        role="img"
        aria-label={`Attempt ${att.attempt_id} bubble chart`}
        style={{ display: "block", minWidth: chartW }}
      >
        <line x1={padL} y1={chartH - padB} x2={chartW - padR} y2={chartH - padB} stroke="#cbd5e1" />
        <line x1={padL} y1={padT} x2={padL} y2={chartH - padB} stroke="#cbd5e1" />
        <text x={chartW / 2} y={chartH - 8} textAnchor="middle" fill="#64748b" fontSize="12">
          Question sequence
        </text>
        <text x={18} y={chartH / 2} textAnchor="middle" transform={`rotate(-90 18 ${chartH / 2})`} fill="#64748b" fontSize="12">
          Time (seconds)
        </text>
        {[0, 0.25, 0.5, 0.75, 1].map((r) => {
          const yVal = Math.round(maxY * r);
          const y = yToPx(yVal);
          return (
            <g key={`${att.attempt_id}-y-${r}`}>
              <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#f1f5f9" />
              <text x={padL - 8} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="11">
                {yVal}
              </text>
            </g>
          );
        })}
        {steps.map((step) => {
          const cx = xToPx(step.sequence);
          const cy = yToPx(step.time_spent_seconds ?? 0);
          const rad = difficultyRadius(step.difficulty);
          const fill = step.is_correct ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)";
          const stroke = step.is_correct ? "#059669" : "#dc2626";
          return (
            <g key={`${att.attempt_id}-${step.sequence}`}>
              <circle cx={cx} cy={cy} r={rad} fill={fill} stroke={stroke} />
              <title>{`#${step.sequence} ${step.difficulty} · ${formatQuestionTime(step.time_spent_seconds)} · ${step.is_correct ? "Correct" : "Incorrect"} · ${step.question_text}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [attemptStudentQ, setAttemptStudentQ] = useState("");
  const [topicQ, setTopicQ] = useState("");
  const [tableQ, setTableQ] = useState("");

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  const aq = attemptStudentQ.trim().toLowerCase();
  const tq = topicQ.trim().toLowerCase();
  const gq = tableQ.trim().toLowerCase();

  const filteredBreakdowns = useMemo(() => {
    const raw = data?.attempt_breakdowns ?? [];
    if (!aq) return raw;
    return raw.filter((a) => a.student_name.toLowerCase().includes(aq));
  }, [data, aq]);

  const filteredTopics = useMemo(() => {
    const raw = data?.accuracy_by_topic ?? [];
    if (!tq) return raw;
    return raw.filter((r) => r.topic.toLowerCase().includes(tq));
  }, [data, tq]);

  const filteredMissed = useMemo(() => {
    const raw = data?.most_missed_questions ?? [];
    if (!gq) return raw;
    return raw.filter((r) => r.question_text.toLowerCase().includes(gq));
  }, [data, gq]);

  const filteredPerformers = useMemo(() => {
    const raw = data?.top_performers ?? [];
    if (!gq) return raw;
    return raw.filter((r) => r.student_name.toLowerCase().includes(gq));
  }, [data, gq]);

  const filteredRecent = useMemo(() => {
    const raw = data?.recent_attempts ?? [];
    if (!gq) return raw;
    return raw.filter((r) => r.student_name.toLowerCase().includes(gq));
  }, [data, gq]);

  if (loading || !data) {
    return (
      <AdminPanel title="Analytics">
        <div className="skeleton" style={{ height: 320 }} />
      </AdminPanel>
    );
  }

  return (
    <AdminPanel
      title="Analytics"
      filters={
        <div className="card" style={{ padding: "1rem", margin: 0 }}>
          <div className="admin-filter-grid">
            <div>
              <label className="label">Attempts — student contains</label>
              <input className="input" value={attemptStudentQ} onChange={(e) => setAttemptStudentQ(e.target.value)} placeholder="Filter bubble charts…" />
            </div>
            <div>
              <label className="label">Topic table — topic contains</label>
              <input className="input" value={topicQ} onChange={(e) => setTopicQ(e.target.value)} placeholder="Filter topic performance…" />
            </div>
            <div>
              <label className="label">Tables — text contains</label>
              <input className="input" value={tableQ} onChange={(e) => setTableQ(e.target.value)} placeholder="Missed, performers, recent…" />
            </div>
          </div>
        </div>
      }
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div className="card">
          <div className="label">Questions</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{data.total_questions}</div>
        </div>
        <div className="card">
          <div className="label">Attempts</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{data.total_attempts}</div>
        </div>
        <div className="card">
          <div className="label">Avg score</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{data.average_score.toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="label">Avg %</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{data.average_percentage.toFixed(1)}%</div>
        </div>
      </div>

      <h3 style={{ marginTop: 0 }}>Tests: question order, difficulty & time</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "0.35rem", maxWidth: 720 }}>
        Bubble chart per attempt: x-axis is question order, y-axis is time spent (seconds), and bubble radius maps to difficulty.
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.75rem", color: "var(--muted)", fontSize: "0.85rem" }}>
        <span>Size: EASY small → EXPERT large</span>
        <span>Color: ✓ correct / ✗ incorrect</span>
        {aq ? (
          <span>
            Showing {filteredBreakdowns.length} / {(data.attempt_breakdowns ?? []).length} attempts
          </span>
        ) : null}
      </div>
      <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {filteredBreakdowns.length === 0 && <div className="empty">No attempts match this filter.</div>}
        {filteredBreakdowns.map((att) => (
          <div key={att.attempt_id} className="card" style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem 1.5rem", alignItems: "baseline", marginBottom: "0.75rem" }}>
              <strong>{att.student_name}</strong>
              <span className="badge">{att.status}</span>
              <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                {att.score}/{att.total_questions} · {att.percentage}% · {new Date(att.started_at).toLocaleString()}
                {att.completed_at ? ` → ${new Date(att.completed_at).toLocaleString()}` : ""}
              </span>
            </div>
            <AttemptChart att={att} />
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: "2rem" }}>Accuracy by difficulty</h3>
      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Difficulty</th>
              <th>Correct</th>
              <th>Total</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {data.accuracy_by_difficulty.map((r) => (
              <tr key={r.difficulty}>
                <td>{r.difficulty}</td>
                <td>{r.correct}</td>
                <td>{r.total}</td>
                <td>{(r.accuracy * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: "2rem" }}>Topic performance</h3>
      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Correct</th>
              <th>Total</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {filteredTopics.map((r) => (
              <tr key={r.topic}>
                <td>{r.topic}</td>
                <td>{r.correct}</td>
                <td>{r.total}</td>
                <td>{(r.accuracy * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredTopics.length === 0 && <div className="empty">No topics match filter.</div>}
      </div>

      <h3 style={{ marginTop: "2rem" }}>Most missed</h3>
      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Misses</th>
              <th>Question</th>
            </tr>
          </thead>
          <tbody>
            {filteredMissed.map((r) => (
              <tr key={r.question_id}>
                <td>{r.miss_count}</td>
                <td>{r.question_text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredMissed.length === 0 && <div className="empty">No rows match filter.</div>}
      </div>

      <h3 style={{ marginTop: "2rem" }}>Top performers</h3>
      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Attempts</th>
              <th>Avg score</th>
              <th>Best %</th>
            </tr>
          </thead>
          <tbody>
            {filteredPerformers.map((r) => (
              <tr key={r.student_name}>
                <td>{r.student_name}</td>
                <td>{r.attempts}</td>
                <td>{r.average_score.toFixed(2)}</td>
                <td>{r.best_percentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredPerformers.length === 0 && <div className="empty">No rows match filter.</div>}
      </div>

      <h3 style={{ marginTop: "2rem" }}>Recent attempts</h3>
      <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Student</th>
              <th>Score</th>
              <th>%</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecent.map((r) => (
              <tr key={r.id}>
                <td>{r.student_name}</td>
                <td>
                  {r.score}/{r.total_questions}
                </td>
                <td>{r.percentage}%</td>
                <td>{new Date(r.started_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRecent.length === 0 && <div className="empty">No rows match filter.</div>}
      </div>
    </AdminPanel>
  );
}
