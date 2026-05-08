import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { listAssignedPapers, resumePaper, startPaper } from "../api/client";
import type { AssignedPaperItem } from "../api/types";
import { useAuthStore } from "../store/authStore";
import { useTestSession } from "../store/testSession";

function PaperRow({
  p,
  starting,
  onStart,
  onContinue,
}: {
  p: AssignedPaperItem;
  starting: string | null;
  onStart: (id: string) => void;
  onContinue: (id: string) => void;
}) {
  const canStart = !p.has_started && !p.completed;
  const canContinue = Boolean(p.has_started && !p.completed && p.paper_attempt_id);

  return (
    <div
      className="card"
      style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}
    >
      <div>
        <h3 style={{ margin: "0 0 0.35rem" }}>{p.title}</h3>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>
          {p.section_count} section{p.section_count === 1 ? "" : "s"} · +{p.marks_per_correct} / −{p.marks_per_incorrect} per wrong
        </p>
        {p.completed ? (
          <span className="badge" style={{ marginTop: "0.5rem", display: "inline-block" }}>
            Completed
          </span>
        ) : p.has_started ? (
          <span className="badge" style={{ marginTop: "0.5rem", display: "inline-block" }}>
            In progress
          </span>
        ) : null}
      </div>
      {p.completed ? null : (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {canContinue ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={starting === p.paper_id}
              onClick={() => onContinue(p.paper_id)}
            >
              {starting === p.paper_id ? "Opening…" : "Continue"}
            </button>
          ) : null}
          {canStart ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={starting === p.paper_id}
              onClick={() => onStart(p.paper_id)}
            >
              {starting === p.paper_id ? "Starting…" : "Start"}
            </button>
          ) : null}
          {!canStart && !canContinue ? (
            <button type="button" className="btn btn-primary" disabled>
              Unavailable
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function PapersPage() {
  const nav = useNavigate();
  const session = useAuthStore((s) => s.session);
  const hydratePaperStart = useTestSession((s) => s.hydratePaperStart);
  const reset = useTestSession((s) => s.reset);

  const [items, setItems] = useState<AssignedPaperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);

  const { pending, completed } = useMemo(() => {
    const pending = items.filter((p) => !p.completed);
    const completed = items.filter((p) => p.completed);
    return { pending, completed };
  }, [items]);

  useEffect(() => {
    listAssignedPapers()
      .then(setItems)
      .catch(() => toast.error("Could not load papers"))
      .finally(() => setLoading(false));
  }, []);

  async function onStart(paperId: string) {
    if (!session?.username) {
      toast.error("Not signed in");
      return;
    }
    setStarting(paperId);
    try {
      reset();
      const res = await startPaper(paperId);
      hydratePaperStart(res, session.username);
      nav("/test");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not start paper");
    } finally {
      setStarting(null);
    }
  }

  async function onContinue(paperId: string) {
    if (!session?.username) {
      toast.error("Not signed in");
      return;
    }
    setStarting(paperId);
    try {
      reset();
      const res = await resumePaper(paperId);
      hydratePaperStart(res, session.username);
      nav("/test");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not resume paper");
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="page">
      <h1>Question papers</h1>
      <p style={{ color: "var(--muted)" }}>
        Papers assigned to you by an instructor. Once you start a paper, you cannot restart it — use Continue to pick up where you left off, or end the paper from the test screen.
      </p>
      <p style={{ marginTop: "0.75rem" }}>
        <Link to="/start">Take a standalone adaptive test</Link> instead.
      </p>
      {loading ? (
        <p style={{ marginTop: "1.5rem", color: "var(--muted)" }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <p style={{ margin: 0, color: "var(--muted)" }}>No question papers assigned yet.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 ? (
            <section style={{ marginTop: "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Pending tasks</h2>
              <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0, marginBottom: "0.75rem" }}>
                Assigned papers you have not finished yet.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {pending.map((p) => (
                  <PaperRow key={p.paper_id} p={p} starting={starting} onStart={onStart} onContinue={onContinue} />
                ))}
              </div>
            </section>
          ) : null}
          {completed.length > 0 ? (
            <section style={{ marginTop: pending.length > 0 ? "2rem" : "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Completed</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {completed.map((p) => (
                  <PaperRow key={p.paper_id} p={p} starting={starting} onStart={onStart} onContinue={onContinue} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
