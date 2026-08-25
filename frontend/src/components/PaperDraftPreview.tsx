import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listQuestionsByIds } from "../api/client";
import type { QuestionAdmin, QuestionPaperSection } from "../api/types";

const LOOKUP_CHUNK = 500;

export function servedQuestionIds(sec: QuestionPaperSection): string[] {
  const pool = sec.question_pool_ids ?? [];
  const n = Math.max(0, Number(sec.total_questions) || 0);
  return pool.slice(0, n);
}

async function fetchQuestionsInOrder(ids: string[]): Promise<QuestionAdmin[]> {
  const unique = ids.filter((id, i) => id && ids.indexOf(id) === i);
  const found = new Map<string, QuestionAdmin>();
  for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + LOOKUP_CHUNK);
    const rows = await listQuestionsByIds(chunk);
    for (const q of rows) found.set(q.id, q);
  }
  return ids.map((id) => found.get(id)).filter((q): q is QuestionAdmin => Boolean(q));
}

export function PaperDraftPreview({
  title,
  isAdaptive,
  sections,
  onClose,
}: {
  title: string;
  isAdaptive: boolean;
  sections: QuestionPaperSection[];
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(!isAdaptive);
  const [bySection, setBySection] = useState<QuestionAdmin[][]>([]);

  useEffect(() => {
    if (isAdaptive) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const idsPerSection = sections.map(servedQuestionIds);
    const allIds = idsPerSection.flat();
    fetchQuestionsInOrder(allIds)
      .then((rows) => {
        if (!alive) return;
        const byId = new Map(rows.map((q) => [q.id, q]));
        setBySection(
          idsPerSection.map((ids) => ids.map((id) => byId.get(id)).filter((q): q is QuestionAdmin => Boolean(q))),
        );
      })
      .catch(() => {
        if (alive) {
          toast.error("Could not load question preview");
          setBySection([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isAdaptive, sections]);

  return (
    <div className="qb-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="paper-preview-title" onClick={onClose}>
      <div className="qb-modal-card qb-modal-card--wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
          <div>
            <p className="label" style={{ margin: 0 }}>
              Draft preview
            </p>
            <h3 id="paper-preview-title" style={{ margin: "0.2rem 0 0" }}>
              {title.trim() || "Untitled paper"}
            </h3>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {isAdaptive ? (
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0.85rem 0 0" }}>
            This is an adaptive paper. Students do not get a fixed sequence — each next question is chosen by
            difficulty from the section filters or question set.
          </p>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0.85rem 0 0" }}>
            Non-adaptive sequence as the student will see it: each section serves the selected questions in this
            order, stopping at the section length.
          </p>
        )}

        {loading ? (
          <p style={{ color: "var(--muted)", marginTop: "1rem" }}>Loading questions…</p>
        ) : (
          <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {sections.map((sec, idx) => {
              const served = servedQuestionIds(sec);
              const rows = bySection[idx] ?? [];
              const missing = isAdaptive ? 0 : Math.max(0, served.length - rows.length);
              return (
                <section key={sec.id} className="card" style={{ margin: 0, background: "#f8fafc" }}>
                  <strong>
                    Section {idx + 1}: {sec.title.trim() || "Untitled"}
                  </strong>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
                    {sec.total_questions} question{sec.total_questions === 1 ? "" : "s"} · {sec.time_limit_seconds}s
                    {sec.subject ? ` · ${sec.subject}` : ""}
                    {sec.topic ? ` / ${sec.topic}` : ""}
                  </p>
                  {isAdaptive ? (
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
                      {(sec.question_pool_ids ?? []).length === 0
                        ? "Full bank with section filters."
                        : `${(sec.question_pool_ids ?? []).length} question${(sec.question_pool_ids ?? []).length === 1 ? "" : "s"} in the adaptive pool.`}
                    </p>
                  ) : served.length === 0 ? (
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#b45309" }}>
                      No questions selected yet for this section.
                    </p>
                  ) : (
                    <ol style={{ margin: "0.65rem 0 0", paddingLeft: "1.2rem" }}>
                      {served.map((id, qIdx) => {
                        const q = rows.find((row) => row.id === id);
                        const preview = q
                          ? q.question_text.length > 160
                            ? `${q.question_text.slice(0, 160)}…`
                            : q.question_text
                          : `Question ${id.slice(-6)} (not found)`;
                        return (
                          <li key={`${id}-${qIdx}`} style={{ marginBottom: "0.45rem", fontSize: "0.88rem" }}>
                            {q ? (
                              <>
                                <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                                  {q.difficulty}
                                  {q.subject ? ` · ${q.subject}` : ""}
                                  {q.topic ? ` / ${q.topic}` : ""}
                                </span>
                                <div>{preview}</div>
                              </>
                            ) : (
                              <span style={{ color: "var(--muted)" }}>{preview}</span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {missing > 0 ? (
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#b45309" }}>
                      {missing} selected id{missing === 1 ? "" : "s"} could not be loaded.
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
