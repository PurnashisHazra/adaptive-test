import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AdminFilterShell } from "../../components/AdminFilterShell";
import { AdminPanel } from "../../components/AdminPanel";
import { deleteRcSet, listRcSets } from "../../api/client";
import type { RcSetListItem } from "../../api/types";
import { formatDateTimeIST } from "../../lib/istTime";

export function RcSetsPage() {
  const [items, setItems] = useState<RcSetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [titleQ, setTitleQ] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      setItems(await listRcSets());
    } catch {
      toast.error("Failed to load RC sets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const q = titleQ.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        row.subject.toLowerCase().includes(q) ||
        row.topic.toLowerCase().includes(q),
    );
  }, [items, titleQ]);

  async function onDelete(id: string, title: string) {
    if (!window.confirm(`Delete RC set “${title}” and all ${items.find((x) => x.id === id)?.sub_question_count ?? ""} sub-questions?`)) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteRcSet(id);
      toast.success("Deleted");
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AdminPanel
      title="Reading comprehension sets"
      lead="Create a passage once and attach multiple sub-questions. Each sub-question is stored in the question bank and linked to the passage for the exam UI."
      actions={
        <Link to="/admin/rc-sets/new" className="btn btn-primary">
          New RC set
        </Link>
      }
      filters={
        <AdminFilterShell>
          <div className="admin-filter-grid" style={{ maxWidth: 400 }}>
            <div>
              <label className="label">Filter by title or topic</label>
              <input className="input" value={titleQ} onChange={(e) => setTitleQ(e.target.value)} placeholder="Search RC sets…" />
            </div>
          </div>
          </AdminFilterShell>
      }
    >
      {loading ? (
        <p style={{ marginTop: "1rem", color: "var(--muted)" }}>Loading…</p>
      ) : (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.map((row) => (
            <div key={row.id} className="card" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <h3 style={{ margin: "0 0 0.35rem" }}>{row.title}</h3>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>
                  {row.subject} · {row.topic} · {row.sub_question_count} sub-question{row.sub_question_count === 1 ? "" : "s"}
                </p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                  Tags: {(row.tags.length ? row.tags : ["—"]).join(", ")} · Updated {formatDateTimeIST(row.updated_at)}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <Link to={`/admin/rc-sets/${row.id}`} className="btn btn-ghost" style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}>
                  Edit
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem", color: "var(--danger, #b91c1c)" }}
                  disabled={deletingId === row.id}
                  onClick={() => void onDelete(row.id, row.title)}
                >
                  {deletingId === row.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 ? <p className="empty">{items.length === 0 ? "No RC sets yet." : "No RC sets match this filter."}</p> : null}
        </div>
      )}
    </AdminPanel>
  );
}
