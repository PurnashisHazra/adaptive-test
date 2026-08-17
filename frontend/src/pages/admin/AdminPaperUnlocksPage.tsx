import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  approveAdminPaperUnlock,
  listAdminPaperUnlocksApproved,
  listAdminPaperUnlocksPending,
  rejectAdminPaperUnlock,
} from "../../api/client";
import type { PaperUnlockAdminItem } from "../../api/types";
import { AdminPanel } from "../../components/AdminPanel";

type Tab = "pending" | "approved";

function statusLabel(status: string): string {
  if (status === "pending_payment") return "Awaiting payment";
  if (status === "under_review") return "Under review";
  if (status === "confirmed") return "Approved";
  return status;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function AdminPaperUnlocksPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<PaperUnlockAdminItem[]>([]);
  const [approved, setApproved] = useState<PaperUnlockAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRows, approvedRows] = await Promise.all([
        listAdminPaperUnlocksPending(),
        listAdminPaperUnlocksApproved(),
      ]);
      setPending(pendingRows);
      setApproved(approvedRows);
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

  const items = tab === "pending" ? pending : approved;

  return (
    <AdminPanel title="Paper unlock payments">
      <p className="app-page-lead">
        Approve UPI payments for landing-page mock tests (₹100). On approval, the question paper is assigned to the
        student automatically.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn ${tab === "pending" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTab("pending")}
        >
          Pending {pending.length > 0 ? `(${pending.length})` : ""}
        </button>
        <button
          type="button"
          className={`btn ${tab === "approved" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTab("approved")}
        >
          Approved {approved.length > 0 ? `(${approved.length})` : ""}
        </button>
      </div>

      {loading && items.length === 0 ? (
        <p style={{ color: "var(--muted)", marginTop: "1rem" }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">{tab === "pending" ? "No pending paper unlock payments." : "No approved payments yet."}</p>
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
                  <div style={{ fontSize: "0.85rem", marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className={`badge${p.status === "confirmed" ? " badge--success" : ""}`}>
                      {statusLabel(p.status)}
                    </span>
                    {p.status === "confirmed" && p.confirmed_at ? (
                      <span style={{ color: "var(--muted)" }}>Approved {formatWhen(p.confirmed_at)}</span>
                    ) : null}
                    {p.approved_by ? (
                      <span style={{ color: "var(--muted)" }}>by {p.approved_by}</span>
                    ) : null}
                  </div>
                </div>
                {tab === "pending" ? (
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
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPanel>
  );
}
