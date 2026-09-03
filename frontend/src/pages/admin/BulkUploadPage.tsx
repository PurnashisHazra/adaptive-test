import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AdminPanel } from "../../components/AdminPanel";
import {
  commitPdfQuestionsBatched,
  importQuestionsCsv,
  importQuestionsJson,
  previewPdfQuestions,
} from "../../api/client";
import type { ExamTag, PdfImportPreviewItem, PdfImportPreviewResponse } from "../../api/types";

const PDF_COMMIT_BATCH_SIZE = 20;

const EXAM_TAGS: ExamTag[] = ["CAT", "SSC", "BANK", "RAILWAY", "DEFENCE", "STATE", "OTHER"];

function defaultDraft(subject: string, topic: string): PdfImportPreviewItem {
  return {
    question_text: "",
    question_type: "mcq_single",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_answer: "",
    explanation: null,
    image_url: null,
    difficulty: "EASY",
    subject: subject.trim() || "General",
    topic: topic.trim() || "General",
    exam_tag: "OTHER",
  };
}

export function BulkUploadPage() {
  const [result, setResult] = useState<Awaited<ReturnType<typeof importQuestionsCsv>> | null>(null);

  const [pdfSubject, setPdfSubject] = useState("General");
  const [pdfTopic, setPdfTopic] = useState("General");
  const [pdfMeta, setPdfMeta] = useState<PdfImportPreviewResponse | null>(null);
  const [pdfDrafts, setPdfDrafts] = useState<PdfImportPreviewItem[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfCommitting, setPdfCommitting] = useState(false);
  /** 0–100 upload; `null` while server parses (no byte progress). */
  const [pdfUploadPercent, setPdfUploadPercent] = useState<number | null>(null);
  const [pdfCommitPercent, setPdfCommitPercent] = useState(0);
  const [pdfCommitLabel, setPdfCommitLabel] = useState("");
  const previewAbortRef = useRef<AbortController | null>(null);

  const updateDraft = useCallback((index: number, patch: Partial<PdfImportPreviewItem>) => {
    setPdfDrafts((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  async function onCsv(file: File | null) {
    if (!file) return;
    try {
      const r = await importQuestionsCsv(file);
      setResult(r);
      toast.success(`Inserted ${r.inserted}, skipped ${r.skipped}`);
    } catch {
      toast.error("Import failed");
    }
  }

  async function onJson(file: File | null) {
    if (!file) return;
    try {
      const r = await importQuestionsJson(file);
      setResult(r);
      toast.success(`Inserted ${r.inserted}, skipped ${r.skipped}`);
    } catch {
      toast.error("Import failed");
    }
  }

  async function onPdfPreview(file: File | null) {
    if (!file) return;
    previewAbortRef.current?.abort();
    const ac = new AbortController();
    previewAbortRef.current = ac;
    setPdfLoading(true);
    setPdfMeta(null);
    setPdfUploadPercent(null);
    try {
      const res = await previewPdfQuestions(file, pdfSubject, pdfTopic, {
        signal: ac.signal,
        onProgress: ({ uploadPercent }) => {
          if (uploadPercent != null) setPdfUploadPercent(uploadPercent);
        },
      });
      setPdfUploadPercent(100);
      setPdfMeta(res);
      setPdfDrafts(res.drafts.map((d) => ({ ...d, exam_tag: (d.exam_tag || "OTHER") as ExamTag })));
      if (res.drafts.length === 0) {
        toast.error(res.message || "No questions extracted");
      } else {
        toast.success(`Extracted ${res.drafts.length} draft(s) — review and set correct answers`);
      }
    } catch (err: unknown) {
      const canceled =
        err &&
        typeof err === "object" &&
        (("code" in err && (err as { code?: string }).code === "ERR_CANCELED") ||
          ("name" in err && (err as { name?: string }).name === "CanceledError"));
      if (canceled) return;
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "PDF preview failed");
    } finally {
      setPdfLoading(false);
      setPdfUploadPercent(null);
      previewAbortRef.current = null;
    }
  }

  async function onPdfCommit() {
    if (pdfDrafts.length === 0) {
      toast.error("Nothing to save");
      return;
    }
    setPdfCommitting(true);
    setPdfCommitPercent(0);
    setPdfCommitLabel(`Saving in batches of ${PDF_COMMIT_BATCH_SIZE}…`);
    try {
      const r = await commitPdfQuestionsBatched(pdfDrafts, {
        batchSize: PDF_COMMIT_BATCH_SIZE,
        delayMsBetweenBatches: 120,
        onProgress: ({ percent, batchIndex, batchCount, insertedSoFar, skippedSoFar }) => {
          setPdfCommitPercent(percent);
          setPdfCommitLabel(`Batch ${batchIndex + 1} / ${batchCount} · inserted ${insertedSoFar}, skipped ${skippedSoFar}`);
        },
      });
      setPdfCommitPercent(100);
      setResult(r);
      toast.success(`Inserted ${r.inserted}, skipped ${r.skipped}${r.errors.length ? ` (${r.errors.length} row errors)` : ""}`);
      if (r.errors.length === 0) {
        setPdfDrafts([]);
        setPdfMeta(null);
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setPdfCommitting(false);
      setPdfCommitPercent(0);
      setPdfCommitLabel("");
    }
  }

  return (
    <AdminPanel
      title="Bulk upload"
      actions={
        <Link to="/admin/questions" className="btn btn-ghost">
          Open question bank
        </Link>
      }
    >
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Upload a CSV with headers matching the template, a JSON file with a top-level questions array, or a question-paper PDF
        to extract structured drafts (MCQ / True-False / TITA).
      </p>

      <div className="card" style={{ marginTop: "1.25rem", maxWidth: 960 }}>
        <h3 style={{ marginTop: 0 }}>Question paper (PDF)</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
          Requires <code>OPENAI_API_KEY</code> on the server. Text-based PDFs work best. AI reads the full extracted text and builds
          rows that match the question model (including repeating comprehension passages and copying shared directions onto every question in a range).
          Review each row (type, options, correct answer) before saving.
        </p>
        <div className="grid-2" style={{ marginTop: "0.75rem" }}>
          <div>
            <label className="label">Default subject</label>
            <input className="input" value={pdfSubject} onChange={(e) => setPdfSubject(e.target.value)} />
          </div>
          <div>
            <label className="label">Default topic</label>
            <input className="input" value={pdfTopic} onChange={(e) => setPdfTopic(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <input
            type="file"
            accept=".pdf,application/pdf"
            disabled={pdfLoading}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              void onPdfPreview(f);
            }}
          />
          {pdfLoading ? (
            <div style={{ marginTop: "0.65rem" }}>
              <p style={{ margin: "0 0 0.35rem", color: "var(--muted)", fontSize: "0.9rem" }}>
                {pdfUploadPercent != null && pdfUploadPercent < 100
                  ? "Uploading PDF…"
                  : "Server is extracting questions (this can take a few minutes for large files)…"}
              </p>
              {pdfUploadPercent != null ? (
                <progress
                  style={{ width: "100%", maxWidth: 480, height: 10 }}
                  max={100}
                  value={pdfUploadPercent}
                  aria-label="PDF upload progress"
                />
              ) : (
                <progress style={{ width: "100%", maxWidth: 480, height: 10 }} aria-label="PDF upload and processing" />
              )}
            </div>
          ) : null}
        </div>
        {pdfMeta ? (
          <p style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--muted)" }}>
            Mode: <strong>{pdfMeta.parse_mode}</strong>
            {pdfMeta.parse_mode === "openai_required" ? (
              <span style={{ color: "var(--danger, #b91c1c)" }}> — configure the API key to use PDF import.</span>
            ) : null}
            {pdfMeta.truncated ? " · text was truncated for parsing (very long PDFs)" : ""}
            {pdfMeta.message ? ` — ${pdfMeta.message}` : ""}
          </p>
        ) : null}

        {pdfDrafts.length > 0 ? (
          <div style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPdfDrafts((d) => [...d, defaultDraft(pdfSubject, pdfTopic)])}
              >
                Add blank row
              </button>
              <button type="button" className="btn btn-primary" disabled={pdfCommitting} onClick={() => void onPdfCommit()}>
                {pdfCommitting ? "Saving…" : "Save all to question bank"}
              </button>
            </div>
            {pdfCommitting ? (
              <div style={{ marginBottom: "0.85rem" }}>
                <p style={{ margin: "0 0 0.35rem", fontSize: "0.85rem", color: "var(--muted)" }}>{pdfCommitLabel}</p>
                <progress
                  style={{ width: "100%", maxWidth: 480, height: 10 }}
                  max={100}
                  value={pdfCommitPercent}
                  aria-label="Save progress"
                />
              </div>
            ) : null}
            {pdfDrafts.map((d, idx) => (
              <div
                key={idx}
                className="card"
                style={{ marginBottom: "0.75rem", background: "#f8fafc", border: "1px solid var(--border)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <strong>Question {idx + 1}</strong>
                  <button type="button" className="btn btn-ghost" onClick={() => setPdfDrafts((rows) => rows.filter((_, i) => i !== idx))}>
                    Remove
                  </button>
                </div>
                <label className="label">Question text</label>
                <textarea
                  className="input"
                  rows={3}
                  value={d.question_text}
                  onChange={(e) => updateDraft(idx, { question_text: e.target.value })}
                />
                <div className="grid-2" style={{ marginTop: "0.5rem" }}>
                  <div>
                    <label className="label">Option A</label>
                    <input className="input" value={d.option_a} onChange={(e) => updateDraft(idx, { option_a: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Option B</label>
                    <input className="input" value={d.option_b} onChange={(e) => updateDraft(idx, { option_b: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Option C</label>
                    <input className="input" value={d.option_c} onChange={(e) => updateDraft(idx, { option_c: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Option D</label>
                    <input className="input" value={d.option_d} onChange={(e) => updateDraft(idx, { option_d: e.target.value })} />
                  </div>
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <label className="label">Question type</label>
                  <select
                    className="input"
                    style={{ maxWidth: 280 }}
                    value={d.question_type || "mcq_single"}
                    onChange={(e) => updateDraft(idx, { question_type: e.target.value })}
                  >
                    <option value="mcq_single">Multiple choice (4 options)</option>
                    <option value="true_false">True / False</option>
                    <option value="tita">TITA (typed answer)</option>
                  </select>
                </div>
                <div className="grid-2" style={{ marginTop: "0.5rem" }}>
                  <div>
                    <label className="label">Correct answer</label>
                    {d.question_type === "tita" ? (
                      <input
                        className="input"
                        value={d.correct_answer || ""}
                        onChange={(e) => updateDraft(idx, { correct_answer: e.target.value })}
                        placeholder="Expected answer"
                      />
                    ) : d.question_type === "true_false" ? (
                      <select
                        className="input"
                        value={d.correct_answer || ""}
                        onChange={(e) => updateDraft(idx, { correct_answer: e.target.value })}
                      >
                        <option value="">Select…</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <select
                        className="input"
                        value={d.correct_answer || ""}
                        onChange={(e) => updateDraft(idx, { correct_answer: e.target.value })}
                      >
                        <option value="">Select…</option>
                        <option value="a">a</option>
                        <option value="b">b</option>
                        <option value="c">c</option>
                        <option value="d">d</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="label">Difficulty</label>
                    <select
                      className="input"
                      value={d.difficulty}
                      onChange={(e) => updateDraft(idx, { difficulty: e.target.value })}
                    >
                      <option value="EASY">EASY</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HARD">HARD</option>
                      <option value="EXPERT">EXPERT</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Subject</label>
                    <input className="input" value={d.subject} onChange={(e) => updateDraft(idx, { subject: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Topic</label>
                    <input className="input" value={d.topic} onChange={(e) => updateDraft(idx, { topic: e.target.value })} />
                  </div>
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <label className="label">Explanation (optional)</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={d.explanation ?? ""}
                    onChange={(e) => updateDraft(idx, { explanation: e.target.value.trim() || null })}
                  />
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <label className="label">Image URL (optional)</label>
                  <input
                    className="input"
                    value={d.image_url ?? ""}
                    onChange={(e) => updateDraft(idx, { image_url: e.target.value.trim() || null })}
                  />
                </div>
                <div style={{ marginTop: "0.5rem" }}>
                  <label className="label">Exam category</label>
                  <select className="input" value={d.exam_tag || "OTHER"} onChange={(e) => updateDraft(idx, { exam_tag: e.target.value as ExamTag })}>
                    {EXAM_TAGS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: "1.25rem", maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>CSV</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
          Columns: question_text, question_type (mcq_single, true_false, or tita / type_in / short_answer / fill_in), option_a–d (leave blank for TITA), correct_answer, difficulty, subject, topic, tags (exam category: CAT/SSC/BANK/RAILWAY/DEFENCE/STATE/OTHER), explanation, image_url (optional; public image link, or use column name image_link), explanation_image_url (optional; public image link shown with the explanation)
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onCsv(e.target.files?.[0] ?? null)} />
      </div>

      <div className="card" style={{ marginTop: "1rem", maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>JSON</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Format: {"{ \"questions\": [ { ...QuestionCreate } ] }"}</p>
        <input type="file" accept=".json,application/json" onChange={(e) => onJson(e.target.files?.[0] ?? null)} />
      </div>

      {result && (
        <div className="card" style={{ marginTop: "1rem", maxWidth: 720 }}>
          <h3 style={{ marginTop: 0 }}>Last result</h3>
          <p>
            Inserted: {result.inserted} · Skipped (duplicates): {result.skipped}
          </p>
          {result.errors.length > 0 && (
            <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td>{e.row}</td>
                      <td>{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </AdminPanel>
  );
}
