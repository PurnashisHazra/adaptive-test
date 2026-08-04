import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AdminPanel } from "../../components/AdminPanel";
import { formatDateTimeIST } from "../../lib/istTime";
import { listAdminQuestionReports } from "../../api/client";
import type { QuestionReport } from "../../api/types";

const pageSize = 20;

export function QuestionReportsPage() {
  const [items, setItems] = useState<QuestionReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listAdminQuestionReports({ page, page_size: pageSize })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => toast.error("Failed to load reports"))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminPanel title="Reports & queries">
      <p className="app-page-lead">
        Students can flag a question during a test. Each row is a report with optional note; open the question in the bank to edit or retire it.
      </p>
      <div className="table-wrap" style={{ marginTop: "1rem" }}>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Student</th>
                <th>Q#</th>
                <th>Session</th>
                <th>Question (snapshot)</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}>{formatDateTimeIST(r.created_at)}</td>
                  <td>{r.student_username}</td>
                  <td>{r.question_index}</td>
                  <td>
                    <span className="badge">{r.session_type === "paper_section" ? "Paper" : "Adaptive"}</span>
                    {r.paper_title_snapshot ? (
                      <span style={{ display: "block", fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>{r.paper_title_snapshot}</span>
                    ) : null}
                  </td>
                  <td style={{ maxWidth: 280, fontSize: "0.88rem" }}>
                    {(r.question_text_snapshot || "—").slice(0, 160)}
                    {(r.question_text_snapshot || "").length > 160 ? "…" : ""}
                  </td>
                  <td style={{ maxWidth: 200, fontSize: "0.88rem" }}>{r.message || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link to={`/admin/questions/${encodeURIComponent(r.question_id)}`} className="btn btn-ghost" style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}>
                      Question
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && items.length === 0 && <div className="empty">No question reports yet.</div>}
      </div>
      {total > 0 ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            {total} total · page {page} of {totalPages}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button type="button" className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      ) : null}
    </AdminPanel>
  );
}
