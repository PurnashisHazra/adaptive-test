import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { createQuestion, getQuestion, updateQuestion, uploadQuestionImage } from "../../api/client";
import { AdminPanel } from "../../components/AdminPanel";
import type { Difficulty, ExamTag, QuestionOption, QuestionType } from "../../api/types";

const EXAM_TAGS: ExamTag[] = ["CAT", "SSC", "BANK", "RAILWAY", "DEFENCE", "STATE", "OTHER"];

const defaultMcqOptions = (): QuestionOption[] => [
  { key: "a", label: "" },
  { key: "b", label: "" },
  { key: "c", label: "" },
  { key: "d", label: "" },
];

function applyQuestionTypeChange(next: QuestionType, setOptions: (o: QuestionOption[]) => void, setCorrectAnswer: (s: string) => void) {
  if (next === "true_false") {
    setOptions([
      { key: "true", label: "True" },
      { key: "false", label: "False" },
    ]);
    setCorrectAnswer("true");
  } else if (next === "tita") {
    setOptions([]);
    setCorrectAnswer("");
  } else {
    setOptions(defaultMcqOptions());
    setCorrectAnswer("a");
  }
}

export function QuestionFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = Boolean(id);

  const [questionText, setQuestionText] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("mcq_single");
  const [options, setOptions] = useState<QuestionOption[]>(defaultMcqOptions());
  const [correctAnswer, setCorrectAnswer] = useState("a");
  const [explanation, setExplanation] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [subject, setSubject] = useState("General");
  const [topic, setTopic] = useState("");
  const [examTag, setExamTag] = useState<ExamTag>("CAT");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getQuestion(id)
      .then((q) => {
        setQuestionText(q.question_text);
        setQuestionType(q.question_type);
        setOptions(q.options.length ? q.options : q.question_type === "tita" ? [] : defaultMcqOptions());
        setCorrectAnswer(q.correct_answer);
        setExplanation(q.explanation || "");
        setDifficulty(q.difficulty);
        setSubject(q.subject);
        setTopic(q.topic);
        const firstTag = (q.tags[0] || "OTHER").toUpperCase();
        setExamTag((EXAM_TAGS.includes(firstTag as ExamTag) ? firstTag : "OTHER") as ExamTag);
        setImageUrl(q.image_url?.trim() ?? "");
      })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const optsPayload =
      questionType === "mcq_single"
        ? options.filter((o) => o.label.trim())
        : questionType === "true_false"
          ? options
          : [];
    const body = {
      question_text: questionText,
      question_type: questionType,
      options: optsPayload,
      correct_answer: correctAnswer,
      explanation: explanation || null,
      difficulty,
      subject,
      topic,
      tags: [examTag],
      image_url: imageUrl.trim() || null,
    };
    try {
      if (isEdit && id) {
        await updateQuestion(id, body);
        toast.success("Saved");
      } else {
        await createQuestion(body);
        toast.success("Created");
      }
      nav("/admin/questions");
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : undefined;
      toast.error(typeof msg === "string" ? msg : "Save failed");
    }
  }

  if (loading && isEdit) {
    return (
      <AdminPanel title="Edit question">
        <div className="skeleton" style={{ height: 400 }} />
      </AdminPanel>
    );
  }

  return (
    <AdminPanel
      title={isEdit ? "Edit question" : "New question"}
      actions={
        <Link to="/admin/questions" className="btn btn-ghost">
          ← Question bank
        </Link>
      }
    >
      <form className="card" style={{ maxWidth: 720 }} onSubmit={onSubmit}>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Question</label>
          <textarea className="input" rows={4} value={questionText} onChange={(e) => setQuestionText(e.target.value)} required />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Image (optional)</label>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>
            Upload to Cloudflare R2 or paste a public image URL. Shown to students with the question.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="input"
              style={{ maxWidth: 280 }}
              disabled={imageUploading}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setImageUploading(true);
                try {
                  const url = await uploadQuestionImage(f);
                  setImageUrl(url);
                  toast.success("Image uploaded");
                } catch (err: unknown) {
                  const msg =
                    err && typeof err === "object" && "response" in err
                      ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                      : undefined;
                  toast.error(typeof msg === "string" ? msg : "Upload failed");
                } finally {
                  setImageUploading(false);
                }
              }}
            />
            {imageUploading ? <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Uploading…</span> : null}
            {imageUrl ? (
              <button type="button" className="btn btn-ghost" onClick={() => setImageUrl("")}>
                Remove image
              </button>
            ) : null}
          </div>
          <input
            className="input"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
          {imageUrl ? (
            <div style={{ marginTop: "0.65rem" }}>
              <img src={imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid var(--border)" }} />
            </div>
          ) : null}
        </div>
        <div className="grid-2">
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={questionType}
              onChange={(e) => {
                const v = e.target.value as QuestionType;
                setQuestionType(v);
                applyQuestionTypeChange(v, setOptions, setCorrectAnswer);
              }}
            >
              <option value="mcq_single">Multiple choice</option>
              <option value="true_false">True / False</option>
              <option value="tita">TITA (type in the answer)</option>
            </select>
          </div>
          <div>
            <label className="label">Difficulty</label>
            <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="EASY">EASY</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HARD">HARD</option>
              <option value="EXPERT">EXPERT</option>
            </select>
          </div>
        </div>
        {questionType === "tita" ? (
          <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: "var(--muted)" }}>
            Students type a short answer. It is marked correct if it matches your expected answer after trimming spaces and ignoring letter case.
          </p>
        ) : null}
        {questionType === "mcq_single" && (
          <div style={{ marginTop: "1rem" }}>
            <label className="label">Options</label>
            {options.map((o, i) => (
              <div key={i} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <input
                  className="input"
                  style={{ maxWidth: 80 }}
                  value={o.key}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = { ...next[i], key: e.target.value };
                    setOptions(next);
                  }}
                  placeholder="key"
                />
                <input
                  className="input"
                  value={o.label}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = { ...next[i], label: e.target.value };
                    setOptions(next);
                  }}
                  placeholder="Label"
                />
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: "1rem" }}>
          <label className="label">
            {questionType === "tita" ? "Expected answer (exact match after trim & case ignore)" : "Correct answer (option key)"}
          </label>
          {questionType === "tita" ? (
            <input className="input" value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} required placeholder="e.g. 42 or Newton" />
          ) : (
            <input className="input" value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} required />
          )}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <label className="label">Explanation (optional)</label>
          <textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </div>
        <div className="grid-2" style={{ marginTop: "1rem" }}>
          <div>
            <label className="label">Subject</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="label">CAT Topic</label>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Algebra" required />
          </div>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <label className="label">Exam category</label>
          <select className="input" value={examTag} onChange={(e) => setExamTag(e.target.value as ExamTag)}>
            {EXAM_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
          <Link to="/admin/questions" className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </AdminPanel>
  );
}
