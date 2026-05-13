import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  autoAssignQuestionDifficulties,
  countQuestions,
  createQuestion,
  deleteAllQuestions,
  deleteQuestion,
  downloadQuestionsCsv,
  generateAiQuestionDraft,
  listQuestions,
} from "../../api/client";
import type { Difficulty, QuestionAdmin, QuestionCreatePayload, QuestionType } from "../../api/types";
import { AdminPanel } from "../../components/AdminPanel";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function QuestionsPage() {
  const [items, setItems] = useState<QuestionAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [globalQuestionCount, setGlobalQuestionCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [questionType, setQuestionType] = useState<QuestionType | "">("");
  const [search, setSearch] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiApproving, setAiApproving] = useState(false);
  const [aiDraft, setAiDraft] = useState<QuestionCreatePayload | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [assigningDifficulty, setAssigningDifficulty] = useState(false);

  const pageSize = 15;
  const debouncedSearch = useDebouncedValue(search.trim(), 400);
  const prevDebouncedSearch = useRef<string | null>(null);

  async function loadWithPage(p: number) {
    setLoading(true);
    try {
      const [res, allN] = await Promise.all([
        listQuestions({
          page: p,
          page_size: pageSize,
          subject: subject || undefined,
          topic: topic || undefined,
          difficulty: difficulty || undefined,
          question_type: questionType || undefined,
          search: debouncedSearch || undefined,
        }),
        countQuestions(),
      ]);
      setItems(res.items);
      setTotal(res.total);
      setGlobalQuestionCount(allN);
    } catch {
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const searchChanged =
      prevDebouncedSearch.current !== null && prevDebouncedSearch.current !== debouncedSearch;
    prevDebouncedSearch.current = debouncedSearch;

    if (searchChanged && page !== 1) {
      setPage(1);
      return;
    }
    void loadWithPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch]);

  async function load() {
    await loadWithPage(page);
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this question?")) return;
    try {
      await deleteQuestion(id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  }

  async function onDownloadCsv() {
    setExportingCsv(true);
    try {
      await downloadQuestionsCsv();
      toast.success("Download started");
    } catch {
      toast.error("CSV export failed");
    } finally {
      setExportingCsv(false);
    }
  }

  async function onDeleteAll() {
    if (!window.confirm(`Delete all ${globalQuestionCount} question(s) in the bank? This cannot be undone.`)) return;
    if (window.prompt('Type DELETE ALL to confirm (capital letters).') !== "DELETE ALL") {
      toast.error("Cancelled");
      return;
    }
    setDeletingAll(true);
    try {
      const n = await deleteAllQuestions();
      toast.success(`Removed ${n} question(s)`);
      setPage(1);
      load();
    } catch {
      toast.error("Delete all failed");
    } finally {
      setDeletingAll(false);
    }
  }

  async function onGenerateAiDraft() {
    if (!aiPrompt.trim()) {
      toast.error("Please enter a prompt.");
      return;
    }
    setAiGenerating(true);
    try {
      const draft = await generateAiQuestionDraft({
        prompt: aiPrompt.trim(),
        subject: subject || undefined,
        topic: topic || undefined,
      });
      setAiDraft(draft);
      toast.success("AI draft generated");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not generate draft");
    } finally {
      setAiGenerating(false);
    }
  }

  async function onAutoAssignDifficulty() {
    if (items.length === 0) {
      toast.error("No questions on this page. Apply filters and go to a page with questions.");
      return;
    }
    if (
      !window.confirm(
        `Use OpenAI to set difficulty for ${items.length} question(s) on this page, using each question’s text and exam tags? This uses your API key and may take a little while.`,
      )
    ) {
      return;
    }
    setAssigningDifficulty(true);
    try {
      const res = await autoAssignQuestionDifficulties({ question_ids: items.map((q) => q.id) });
      if (res.updated > 0) {
        toast.success(`Updated difficulty for ${res.updated} question(s).`);
      }
      if (res.errors.length > 0) {
        const msg = res.errors.slice(0, 4).join(" · ");
        toast.error(res.errors.length > 4 ? `${msg}…` : msg);
      } else if (res.updated === 0) {
        toast.error("No questions were updated. Check the OpenAI key and try again.");
      }
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Auto-assign difficulty failed");
    } finally {
      setAssigningDifficulty(false);
    }
  }

  async function onApproveAiDraft() {
    if (!aiDraft) return;
    setAiApproving(true);
    try {
      await createQuestion(aiDraft);
      toast.success("AI question added");
      setShowAiModal(false);
      setAiDraft(null);
      setAiPrompt("");
      load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Failed to add AI question");
    } finally {
      setAiApproving(false);
    }
  }

  return (
    <AdminPanel
      title="Question bank"
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onDownloadCsv} disabled={exportingCsv}>
            {exportingCsv ? "Exporting…" : "Download CSV"}
          </button>
          <button type="button" className="btn btn-danger" onClick={onDeleteAll} disabled={deletingAll || globalQuestionCount === 0}>
            {deletingAll ? "Deleting…" : "Delete all"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onAutoAssignDifficulty}
            disabled={assigningDifficulty || loading || items.length === 0}
            title="Assigns EASY/MEDIUM/HARD/EXPERT using OpenAI from question text and exam category tags (current page only, max 30)."
          >
            {assigningDifficulty ? "Assigning…" : "Auto assign difficulty"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowAiModal(true)}>
            AI-Add Question
          </button>
          <Link to="/admin/questions/new" className="btn btn-primary">
            Add question
          </Link>
        </>
      }
      filters={
        <div className="card" style={{ padding: "1rem", margin: 0 }}>
          <div className="admin-filter-grid" style={{ marginBottom: "0.75rem" }}>
            <div>
              <label className="label">Search</label>
              <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Question text, explanation, or tag" />
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>
                Match/Contains search term in question text, explanation, tags, and MCQ option labels. Case-insensitive;
              </p>
            </div>
            <div>
              <label className="label">Subject</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="label">Topic</label>
              <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div>
              <label className="label">Difficulty</label>
              <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}>
                <option value="">Any</option>
                <option value="EASY">EASY</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HARD">HARD</option>
                <option value="EXPERT">EXPERT</option>
              </select>
            </div>
            <div>
              <label className="label">Question type</label>
              <select className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value as QuestionType | "")}>
                <option value="">Any</option>
                <option value="mcq_single">MCQ</option>
                <option value="true_false">True / false</option>
                <option value="tita">TITA</option>
              </select>
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => { if (page !== 1) setPage(1); else void loadWithPage(1); }}>
            Apply filters
          </button>
        </div>
      }
    >
      <div className="table-wrap">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Text</th>
                <th>Type</th>
                <th>Difficulty</th>
                <th>Subject</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id}>
                  <td style={{ maxWidth: 360 }}>{q.question_text.slice(0, 120)}{q.question_text.length > 120 ? "…" : ""}</td>
                  <td>{q.question_type}</td>
                  <td>
                    <span className="badge">{q.difficulty}</span>
                  </td>
                  <td>{q.subject}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link to={`/admin/questions/${q.id}`} className="btn btn-ghost" style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}>
                      Edit
                    </Link>{" "}
                    <button type="button" className="btn btn-danger" style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }} onClick={() => onDelete(q.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && items.length === 0 && <div className="empty">No questions match.</div>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          {total} total · page {page} of {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {showAiModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: "1rem",
          }}
          onClick={() => setShowAiModal(false)}
        >
          <div
            className="card"
            style={{ width: "min(900px, 96vw)", maxHeight: "90vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Generate CAT Question with AI</h3>
            <p style={{ color: "var(--muted)", marginTop: "-0.25rem" }}>
              Provide an instruction prompt. You will review and approve before saving.
            </p>
            <label className="label">Prompt</label>
            <textarea
              className="input"
              rows={5}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Example: Create an EXPERT CAT quant question on algebra with tricky distractors and clear explanation."
            />
            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" onClick={onGenerateAiDraft} disabled={aiGenerating}>
                {aiGenerating ? "Generating…" : "Generate draft"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowAiModal(false);
                  setAiDraft(null);
                }}
              >
                Close
              </button>
            </div>

            {aiDraft && (
              <div style={{ marginTop: "1.25rem" }}>
                <h4 style={{ marginBottom: "0.5rem" }}>Generated Draft (Review)</h4>
                <div className="card" style={{ background: "#f8fafc" }}>
                  <div style={{ marginBottom: "0.6rem" }}>
                    <strong>Question:</strong>
                    <div>{aiDraft.question_text}</div>
                  </div>
                  <div style={{ marginBottom: "0.6rem" }}>
                    <strong>Difficulty:</strong> <span className="badge">{aiDraft.difficulty}</span>
                    {"  "}
                    <strong>Subject:</strong> {aiDraft.subject}
                    {"  "}
                    <strong>Topic:</strong> {aiDraft.topic}
                  </div>
                  <div style={{ marginBottom: "0.6rem" }}>
                    <strong>Options:</strong>
                    <ul style={{ marginTop: "0.35rem" }}>
                      {aiDraft.options.map((o) => (
                        <li key={o.key}>
                          {o.key}: {o.label}
                        </li>
                      ))}
                    </ul>
                    <div>
                      <strong>Correct:</strong> {aiDraft.correct_answer}
                    </div>
                  </div>
                  {aiDraft.explanation && (
                    <div style={{ marginBottom: "0.6rem" }}>
                      <strong>Explanation:</strong> {aiDraft.explanation}
                    </div>
                  )}
                  <div>
                    <strong>Tags:</strong> {aiDraft.tags.join(", ")}
                  </div>
                </div>
                <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-primary" onClick={onApproveAiDraft} disabled={aiApproving}>
                    {aiApproving ? "Adding…" : "Approve & Add"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setAiDraft(null)}>
                    Discard draft
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminPanel>
  );
}
