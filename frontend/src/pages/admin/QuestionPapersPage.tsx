import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AdminFilterShell } from "../../components/AdminFilterShell";
import { AdminPanel } from "../../components/AdminPanel";
import { listQuestionPapers } from "../../api/client";
import type { QuestionPaper } from "../../api/types";

export function QuestionPapersPage() {
  const [items, setItems] = useState<QuestionPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [titleQ, setTitleQ] = useState("");

  useEffect(() => {
    listQuestionPapers()
      .then(setItems)
      .catch(() => toast.error("Failed to load papers"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = titleQ.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.title.toLowerCase().includes(q));
  }, [items, titleQ]);

  return (
    <AdminPanel
      title="Question papers"
      lead="Multi-section papers with per-section subject, topic, question count, and time. Assign to students who have accounts."
      actions={
        <Link to="/admin/question-papers/new" className="btn btn-primary">
          New paper
        </Link>
      }
      filters={
        <AdminFilterShell>
          <div className="admin-filter-grid" style={{ maxWidth: 400 }}>
            <div>
              <label className="label">Filter by title</label>
              <input className="input" value={titleQ} onChange={(e) => setTitleQ(e.target.value)} placeholder="Search papers…" />
            </div>
          </div>
          </AdminFilterShell>
      }
    >
      {loading ? (
        <p style={{ marginTop: "1rem", color: "var(--muted)" }}>Loading…</p>
      ) : (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.map((p) => (
            <Link key={p.id} to={`/admin/question-papers/${p.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <h3 style={{ margin: "0 0 0.35rem" }}>{p.title}</h3>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>
                {p.sections.length} section{p.sections.length === 1 ? "" : "s"} · marking +{p.marks_per_correct} / −{p.marks_per_incorrect}
              </p>
            </Link>
          ))}
          {filtered.length === 0 ? <p className="empty">{items.length === 0 ? "No papers yet." : "No papers match this filter."}</p> : null}
        </div>
      )}
    </AdminPanel>
  );
}
