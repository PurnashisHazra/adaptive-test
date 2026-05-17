import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getMyStandaloneReview } from "../api/client";
import type { StudentStandaloneDetail } from "../api/types";

export function AttemptDrilldownModal({
  attemptId,
  open,
  onClose,
}: {
  attemptId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<StudentStandaloneDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !attemptId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMyStandaloneReview(attemptId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load this attempt");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, attemptId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !attemptId) return null;

  return (
    <div
      className="radar-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Attempt details"
      onClick={onClose}
    >
      <div className="radar-modal-panel" style={{ maxWidth: 720, maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{detail?.title ?? "Attempt"}</h3>
            {detail ? (
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
                {new Date(detail.started_at).toLocaleString()}
                {detail.completed_at ? ` → ${new Date(detail.completed_at).toLocaleString()}` : ""}
                {" · "}
                Score {detail.score}/{detail.total_questions}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading questions…</p>
        ) : detail?.questions.length ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, overflowY: "auto", maxHeight: "calc(90vh - 8rem)" }}>
            {detail.questions.map((q) => (
              <li
                key={`${q.question_id}-${q.index}`}
                className="card"
                style={{
                  marginBottom: "0.65rem",
                  padding: "0.75rem 0.85rem",
                  borderLeft: `4px solid ${q.is_correct ? "var(--success)" : "var(--danger)"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>Question {q.index}</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: q.is_correct ? "var(--success)" : "var(--danger)" }}>
                    {q.is_correct ? "Correct" : "Wrong"}
                  </span>
                </div>
                <p style={{ margin: "0.4rem 0 0.35rem", fontSize: "0.9rem", lineHeight: 1.45 }}>{q.question_text}</p>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
                  Time on question:{" "}
                  <strong style={{ color: "var(--text)" }}>{q.time_spent_seconds != null ? `${q.time_spent_seconds}s` : "—"}</strong>
                </p>
              </li>
            ))}
          </ul>
        ) : detail ? (
          <p style={{ color: "var(--muted)", margin: 0 }}>No questions recorded for this attempt.</p>
        ) : null}
      </div>
    </div>
  );
}
