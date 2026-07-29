import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  approveAdminMentorshipBooking,
  listAdminMentorshipBookingsPending,
  rejectAdminMentorshipBooking,
} from "../../api/client";
import type { MentorshipBookingAdminItem } from "../../api/types";
import { AdminPanel } from "../../components/AdminPanel";

function statusLabel(status: string): string {
  if (status === "pending_payment") return "Awaiting payment";
  if (status === "under_review") return "Under review";
  return status;
}

export function AdminMentorshipBookingsPage() {
  const [items, setItems] = useState<MentorshipBookingAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listAdminMentorshipBookingsPending());
    } catch {
      toast.error("Could not load mentorship bookings");
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
      await approveAdminMentorshipBooking(id);
      toast.success("Payment approved — student will see confirmation");
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
    if (!window.confirm("Reject this payment? The student will be notified in the booking modal.")) return;
    setActing(id);
    try {
      await rejectAdminMentorshipBooking(id);
      toast.success("Booking rejected");
      await load();
    } catch {
      toast.error("Reject failed");
    } finally {
      setActing(null);
    }
  }

  return (
    <AdminPanel title="Mentorship payments">
      <p style={{ color: "var(--muted)", marginTop: 0, maxWidth: 640 }}>
        Approve UPI payments for topper mentorship sessions (₹100). Students see a live status update when you approve.
      </p>

      {loading && items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">No pending mentorship payments.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "1rem" }}>
          {items.map((b) => (
            <div key={b.id} className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{b.student_username}</div>
                  <div style={{ fontSize: "0.9rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                    {b.session_date} · {b.session_time} · ₹{b.amount_inr}
                  </div>
                  <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                    <span className="badge">{statusLabel(b.status)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={acting === b.id}
                    onClick={() => void onApprove(b.id)}
                  >
                    {acting === b.id ? "…" : "Approve payment"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={acting === b.id}
                    onClick={() => void onReject(b.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
              <p style={{ margin: "0.75rem 0 0", fontSize: "0.92rem", color: "var(--muted)", lineHeight: 1.55 }}>
                <strong style={{ color: "var(--text)" }}>Pre-meet question:</strong> {b.pre_meet_question}
              </p>
            </div>
          ))}
        </div>
      )}
    </AdminPanel>
  );
}
