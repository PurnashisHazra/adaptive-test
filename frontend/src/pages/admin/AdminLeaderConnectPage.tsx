import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  downloadLeaderConnectCv,
  listAdminLeaderConnectRequests,
  markAdminLeaderConnectReviewed,
} from "../../api/client";
import type { LeaderConnectRequestAdminItem } from "../../api/types";
import { AdminPanel } from "../../components/AdminPanel";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function AdminLeaderConnectPage() {
  const [items, setItems] = useState<LeaderConnectRequestAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listAdminLeaderConnectRequests());
    } catch {
      toast.error("Could not load leader connect requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onMarkReviewed(id: string) {
    setActing(id);
    try {
      await markAdminLeaderConnectReviewed(id);
      toast.success("Marked as reviewed");
      await load();
    } catch {
      toast.error("Update failed");
    } finally {
      setActing(null);
    }
  }

  async function onDownloadCv(item: LeaderConnectRequestAdminItem) {
    if (!item.cv_filename) return;
    try {
      await downloadLeaderConnectCv(item.id, item.cv_filename);
    } catch {
      toast.error("Could not download CV");
    }
  }

  const pending = items.filter((i) => i.status === "pending");

  return (
    <AdminPanel title="Leader connect requests">
      <p className="app-page-lead">
        Students request 1-on-1 conversations with ex-students at top companies from the landing page. Review details,
        download CVs, and mark requests once you have followed up.
      </p>

      {loading && items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">No leader connect requests yet.</p>
      ) : (
        <>
          {pending.length > 0 ? (
            <p style={{ margin: "1rem 0 0.5rem", fontWeight: 600 }}>
              {pending.length} pending request{pending.length === 1 ? "" : "s"}
            </p>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "1rem" }}>
            {items.map((item) => (
              <div key={item.id} className="card" style={{ margin: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>
                      {item.company_interested_in}
                      <span style={{ color: "var(--muted)", fontWeight: 500 }}> · clicked {item.company_clicked}</span>
                    </div>
                    <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                      {item.mobile}
                      {item.student_username ? ` · ${item.student_username}` : ""} · {formatWhen(item.created_at)}
                    </div>
                    <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                      <span className={`badge${item.status === "pending" ? "" : ""}`}>
                        {item.status === "pending" ? "Pending" : "Reviewed"}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    {item.cv_filename ? (
                      <button type="button" className="btn btn-ghost" onClick={() => void onDownloadCv(item)}>
                        Download CV
                      </button>
                    ) : null}
                    {item.status === "pending" ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={acting === item.id}
                        onClick={() => void onMarkReviewed(item.id)}
                      >
                        {acting === item.id ? "…" : "Mark reviewed"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p style={{ margin: "0.75rem 0 0", fontSize: "0.95rem", color: "var(--muted)", lineHeight: 1.55 }}>
                  <strong style={{ color: "var(--text)" }}>Main topic:</strong> {item.main_topic}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </AdminPanel>
  );
}
