import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AdminFilterShell } from "../../components/AdminFilterShell";
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
      lead="Timed contests announced weekly."
      actions={
        <Link to="/admin/challenges/new" className="btn btn-primary">
          New challenge
        </Link>
      }
      filters={
        <AdminFilterShell>
          <div className="admin-filter-grid" style={{ maxWidth: 400 }}>
            <div>
              <label className="label">Filter by title</label>
              <input className="input" value={titleQ} onChange={(e) => setTitleQ(e.target.value)} placeholder="Search challenges…" />
            </div>
          </div>
          </AdminFilterShell>
      }
    >
      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : (
        <div className="app-page-stack app-page-stack--lg">
          {filtered.map((p) => (
            <Link key={p.id} to={`/admin/challenges/${p.id}`} className="card app-row-card" style={{ textDecoration: "none", color: "inherit", flexDirection: "column", alignItems: "stretch" }}>
              <div>
                <h3 className="app-row-card__title">{p.title}</h3>
                <p className="app-row-card__meta">
                  {p.level} · {p.is_adaptive ? "Adaptive" : "Fixed"} · {p.sections.length} section{p.sections.length === 1 ? "" : "s"}
                </p>
                <p className="app-row-card__meta" style={{ marginTop: "0.35rem" }}>
                  {formatDateTimeIST(p.launch_at)} → {formatDateTimeIST(p.end_at)}
                  {p.open_to_all ? " · Open to all" : ""}
                </p>
              </div>
            </Link>
          ))}
          {filtered.length === 0 ? <p className="empty">{items.length === 0 ? "No challenges yet." : "No challenges match this filter."}</p> : null}
        </div>
      )}
    </AdminPanel>
  );
}
