import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AdminFilterShell } from "../../components/AdminFilterShell";
import { AdminPanel } from "../../components/AdminPanel";
import { formatDateTimeIST } from "../../lib/istTime";
import { exportAttemptsUrl, listAttempts } from "../../api/client";

interface Row {
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
}

export function AttemptsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentQ, setStudentQ] = useState("");
  const [statusQ, setStatusQ] = useState("");
  const [subjectQ, setSubjectQ] = useState("");

  useEffect(() => {
    setLoading(true);
    listAttempts({ limit: 200 })
      .then((d) => setRows(d as Row[]))
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const subjectOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.subject && String(r.subject).trim()) s.add(String(r.subject).trim());
    }
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const sn = studentQ.trim().toLowerCase();
    const st = statusQ.trim().toLowerCase();
    const sj = subjectQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (sn && !r.student_name.toLowerCase().includes(sn)) return false;
      if (st && r.status.toLowerCase() !== st) return false;
      if (sj && !(r.subject || "").toLowerCase().includes(sj)) return false;
      return true;
    });
  }, [rows, studentQ, statusQ, subjectQ]);

  return (
    <AdminPanel
      title="Attempts"
      actions={
        <>
          <a href={exportAttemptsUrl("csv")} className="btn btn-ghost" download>
            Export CSV
          </a>
          <a href={exportAttemptsUrl("json")} className="btn btn-ghost" download>
            Export JSON
          </a>
        </>
      }
      filters={
        <AdminFilterShell>
          <div className="admin-filter-grid">
            <div>
              <label className="label">Student (contains)</label>
              <input className="input" value={studentQ} onChange={(e) => setStudentQ(e.target.value)} placeholder="Filter by name…" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={statusQ} onChange={(e) => setStatusQ(e.target.value)}>
                <option value="">Any</option>
                <option value="completed">completed</option>
                <option value="in_progress">in_progress</option>
              </select>
            </div>
            <div>
              <label className="label">Subject (contains)</label>
              <input className="input" value={subjectQ} onChange={(e) => setSubjectQ(e.target.value)} list="attempt-subjects" placeholder="e.g. Quant" />
              <datalist id="attempt-subjects">
                {subjectOptions.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </div>
          </div>
          <p style={{ margin: "0.65rem 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
            Showing {filtered.length} of {rows.length} loaded (latest 200 attempts).
          </p>
        </AdminFilterShell>
      }
    >
      <div className="table-wrap">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Student</th>
                <th>Status</th>
                <th>Subject</th>
                <th>Score</th>
                <th>%</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.student_name}</td>
                  <td>{r.status}</td>
                  <td>{r.subject ?? "—"}</td>
                  <td>
                    {r.score}/{r.total_questions}
                  </td>
                  <td>{r.percentage}%</td>
                  <td>{formatDateTimeIST(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && <div className="empty">No attempts match filters.</div>}
      </div>
    </AdminPanel>
  );
}
