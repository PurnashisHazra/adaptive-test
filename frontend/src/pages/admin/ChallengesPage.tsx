import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AdminPanel } from "../../components/AdminPanel";
import { listChallenges } from "../../api/client";
import type { Challenge } from "../../api/types";
import { formatDateTimeIST } from "../../lib/istTime";

export function ChallengesPage() {
  const [items, setItems] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [titleQ, setTitleQ] = useState("");

  useEffect(() => {
    listChallenges()
      .then(setItems)
      .catch(() => toast.error("Failed to load challenges"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = titleQ.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.title.toLowerCase().includes(q));
  }, [items, titleQ]);

  return (
    <AdminPanel
      title="Challenges"
      actions={
        <Link to="/admin/challenges/new" className="btn btn-primary">
          New challenge
        </Link>
      }
      filters={
        <div className="card" style={{ padding: "1rem", margin: 0 }}>
          <div className="admin-filter-grid" style={{ maxWidth: 400 }}>
            <div>
              <label className="label">Filter by title</label>
              <input className="input" value={titleQ} onChange={(e) => setTitleQ(e.target.value)} placeholder="Search challenges…" />
            </div>
          </div>
        </div>
      }
    >
      <p style={{ color: "var(--muted)", maxWidth: 640, marginTop: 0 }}>
        Timed contests with launch and end windows. Same section structure as question papers; optionally open to all students.
      </p>
      {loading ? (
        <p style={{ marginTop: "1rem", color: "var(--muted)" }}>Loading…</p>
      ) : (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.map((p) => (
            <Link key={p.id} to={`/admin/challenges/${p.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <h3 style={{ margin: "0 0 0.35rem" }}>{p.title}</h3>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>
                {p.level} · {p.is_adaptive ? "Adaptive" : "Fixed"} · {p.sections.length} section{p.sections.length === 1 ? "" : "s"}
              </p>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                {formatDateTimeIST(p.launch_at)} → {formatDateTimeIST(p.end_at)}
                {p.open_to_all ? " · Open to all" : ""}
              </p>
            </Link>
          ))}
          {filtered.length === 0 ? <p className="empty">{items.length === 0 ? "No challenges yet." : "No challenges match this filter."}</p> : null}
        </div>
      )}
    </AdminPanel>
  );
}
