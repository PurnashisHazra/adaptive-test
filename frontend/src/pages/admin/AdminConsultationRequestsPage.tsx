import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listAdminConsultationRequests, markAdminConsultationReviewed } from "../../api/client";
import type { ConsultationRequestAdminItem } from "../../api/types";
import { AdminPanel } from "../../components/AdminPanel";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function AdminConsultationRequestsPage() {
  const [items, setItems] = useState<ConsultationRequestAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listAdminConsultationRequests());
    } catch {
      toast.error("Could not load consultation requests");
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
      await markAdminConsultationReviewed(id);
      toast.success("Marked as reviewed");
      await load();
    } catch {
      toast.error("Update failed");
    } finally {
      setActing(null);
    }
  }

  const pending = items.filter((i) => i.status === "pending");

  return (
    <AdminPanel title="Free consultation requests">
      <p className="app-page-lead">
        Students request a free career consultation from the landing page with signup and mobile number only. Follow up
        and mark requests once contacted.
      </p>

      {loading && items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">No consultation requests yet.</p>
      ) : (
        <>
          {pending.length > 0 ? (
            <p style={{ margin: "1rem 0 0.5rem", fontWeight: 600 }}>
              {pending.length} pending request{pending.length === 1 ? "" : "s"}
            </p>
          ) : null}
          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Mobile</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.student_username}</td>
                    <td>{item.mobile}</td>
                    <td>{formatWhen(item.created_at)}</td>
                    <td>
                      <span className="badge">{item.status === "pending" ? "Pending" : "Reviewed"}</span>
                    </td>
                    <td>
                      {item.status === "pending" ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={acting === item.id}
                          onClick={() => void onMarkReviewed(item.id)}
                        >
                          {acting === item.id ? "…" : "Mark reviewed"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminPanel>
  );
}
