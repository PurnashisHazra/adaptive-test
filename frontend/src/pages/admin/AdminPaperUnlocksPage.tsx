import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  approveAdminPaperUnlock,
  listAdminPaperUnlocksPending,
  rejectAdminPaperUnlock,
} from "../../api/client";
import type { PaperUnlockAdminItem } from "../../api/types";
import { AdminPanel } from "../../components/AdminPanel";

function statusLabel(status: string): string {
  if (status === "pending_payment") return "Awaiting payment";
  if (status === "under_review") return "Under review";
  return status;
}

export function AdminPaperUnlocksPage() {
  const [items, setItems] = useState<PaperUnlockAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listAdminPaperUnlocksPending());
    } catch {
      toast.error("Could not load paper unlock payments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [load]);

  async function onApprove(id: string) {
    setActing(id);
    try {
      await approveAdminPaperUnlock(id);
      toast.success("Payment approved — paper assigned to student");
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Approve failed");
    } finally {
      setActing(null);
    }
  }

  async function onReject(id: string) {
    if (!window.confirm("Reject this payment? The student will see rejection in the unlock modal.")) return;
    setActing(id);
    try {
      await rejectAdminPaperUnlock(id);
      toast.success("Unlock request rejected");
      await load();
    } catch {
      toast.error("Reject failed");
    } finally {
      setActing(null);
    }
  }

  return (
    <AdminPanel title="Paper unlock payments">
      <p style={{ color: "var(--muted)", marginTop: 0, maxWidth: 640 }}>
        Approve UPI payments for landing-page mock tests (₹100). On approval, the question paper is assigned to the
        student automatically.
      </p>

      {loading && items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">No pending paper unlock payments.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "1rem" }}>
          {items.map((p) => (
            <div key={p.id} className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.student_username}</div>
                  <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                    {p.paper_title} · ₹{p.amount_inr}
                  </div>
                  <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                    <span className="badge">{statusLabel(p.status)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={acting === p.id}
                    onClick={() => void onApprove(p.id)}
                  >
                    {acting === p.id ? "…" : "Approve & assign"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={acting === p.id}
                    onClick={() => void onReject(p.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPanel>
  );
}
