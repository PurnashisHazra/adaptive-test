import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { listAssignedPapers, resumePaper, startPaper } from "../api/client";
import type { AssignedPaperItem } from "../api/types";
import { AppPage } from "../components/AppPage";
import { PageEmpty, PageLoading } from "../components/AppPageStates";
import { useAuthStore } from "../store/authStore";
import { useTestSession } from "../store/testSession";

function PaperCard({
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
    <article className="card student-paper-card">
      <div>
        <h3 className="student-paper-card__title">{p.title}</h3>
        <p className="student-paper-card__meta">
          {p.is_adaptive === false ? "Non-adaptive" : "Adaptive"} · {p.section_count} section
          {p.section_count === 1 ? "" : "s"} · +{p.marks_per_correct} / −{p.marks_per_incorrect} per wrong
        </p>
        <div className="student-paper-card__badges">
          {p.completed ? (
            <span className="badge" style={{ background: "rgba(34,197,94,0.12)", color: "#166534" }}>
              Completed
            </span>
          ) : p.has_started ? (
            <span className="badge" style={{ background: "rgba(234,179,8,0.14)", color: "#854d0e" }}>
              In progress
            </span>
          ) : (
            <span className="badge">Not started</span>
          )}
        </div>
      </div>
      {p.completed ? null : (
        <div className="student-paper-card__actions">
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
    </article>
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
    <AppPage
      panel
      showSubNav
      title="Question papers"
      lead="Papers assigned by your instructor. Once started, use Continue to pick up where you left off — you cannot restart a paper."
      actions={
        <Link to="/take-test" className="btn btn-ghost" style={{ textDecoration: "none" }}>
          Standalone test
        </Link>
      }
    >
      {loading ? (
        <PageLoading label="Loading assigned papers…" />
      ) : items.length === 0 ? (
        <PageEmpty title="No papers assigned">
          Your instructor has not assigned any question papers yet. You can still take a standalone adaptive test or join
          a challenge from Mock Tests.
        </PageEmpty>
      ) : (
        <>
          <div className="app-stat-grid">
            <div className="card app-stat-card">
              <div className="label">Assigned</div>
              <div className="app-stat-card__value">{items.length}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Pending</div>
              <div className="app-stat-card__value">{pending.length}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Completed</div>
              <div className="app-stat-card__value">{completed.length}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">In progress</div>
              <div className="app-stat-card__value">{pending.filter((p) => p.has_started).length}</div>
            </div>
          </div>

          {pending.length > 0 ? (
            <section className="app-page-section student-content-section">
              <h2 className="app-page-section__title">Pending tasks</h2>
              <p className="app-page-section__lead">Assigned papers you have not finished yet.</p>
              <div className="app-page-stack app-page-stack--lg">
                {pending.map((p) => (
                  <PaperCard key={p.paper_id} p={p} starting={starting} onStart={onStart} onContinue={onContinue} />
                ))}
              </div>
            </section>
          ) : null}

          {completed.length > 0 ? (
            <section className="app-page-section student-content-section">
              <h2 className="app-page-section__title">Completed</h2>
              <p className="app-page-section__lead">Finished papers — open Analytics to review question-by-question.</p>
              <div className="app-page-stack">
                {completed.map((p) => (
                  <PaperCard key={p.paper_id} p={p} starting={starting} onStart={onStart} onContinue={onContinue} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </AppPage>
  );
}
