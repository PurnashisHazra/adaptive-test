import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { createRcSet, getRcSet, updateRcSet, uploadQuestionImage } from "../../api/client";
import { AdminPanel } from "../../components/AdminPanel";
import type { Difficulty, ExamTag, QuestionOption, QuestionType, RcSubQuestionIn } from "../../api/types";

const EXAM_TAGS: ExamTag[] = ["CAT", "SSC", "BANK", "RAILWAY", "DEFENCE", "STATE", "OTHER"];
const MCQ_MAX_OPTIONS = 40;

const defaultMcqOptions = (): QuestionOption[] => [
  { key: "a", label: "" },
  { key: "b", label: "" },
  { key: "c", label: "" },
  { key: "d", label: "" },
];

function nextOptionKey(existing: QuestionOption[]): string {
  const used = new Set(existing.map((o) => o.key.trim().toLowerCase()).filter(Boolean));
  for (let code = 97; code <= 122; code += 1) {
    const k = String.fromCharCode(code);
    if (!used.has(k)) return k;
  }
  let n = 1;
  while (used.has(`opt${n}`)) n += 1;
  return `opt${n}`;
}

function emptySubQuestion(): RcSubQuestionIn {
  return {
    question_text: "",
    question_type: "mcq_single",
    options: defaultMcqOptions(),
    correct_answer: "a",
    explanation: "",
    difficulty: "MEDIUM",
  };
}

function applyQuestionTypeChange(sub: RcSubQuestionIn, next: QuestionType): RcSubQuestionIn {
  if (next === "true_false") {
    return {
      ...sub,
      question_type: next,
      options: [
        { key: "true", label: "True" },
        { key: "false", label: "False" },
      ],
      correct_answer: "true",
    };
  }
  if (next === "tita") {
    return { ...sub, question_type: next, options: [], correct_answer: "" };
  }
  return {
    ...sub,
    question_type: next,
    options: sub.options.length ? sub.options : defaultMcqOptions(),
    correct_answer: sub.correct_answer || "a",
  };
}

function SubQuestionEditor({
  index,
  sub,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  sub: RcSubQuestionIn;
  onChange: (next: RcSubQuestionIn) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="card" style={{ padding: "1rem", marginBottom: "1rem", background: "var(--surface, #fff)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <h4 style={{ margin: 0 }}>Sub-question {index + 1}</h4>
        {canRemove ? (
          <button type="button" className="btn btn-ghost" style={{ fontSize: "0.85rem" }} onClick={onRemove}>
            Remove
          </button>
        ) : null}
      </div>
      <div style={{ marginBottom: "0.75rem" }}>
        <label className="label">Question stem</label>
        <textarea
          className="input"
          rows={3}
          value={sub.question_text}
          onChange={(e) => onChange({ ...sub, question_text: e.target.value })}
          required
        />
      </div>
      <div className="grid-2">
        <div>
          <label className="label">Type</label>
          <select
            className="input"
            value={sub.question_type}
            onChange={(e) => onChange(applyQuestionTypeChange(sub, e.target.value as QuestionType))}
          >
            <option value="mcq_single">Multiple choice</option>
            <option value="true_false">True / False</option>
            <option value="tita">TITA</option>
          </select>
        </div>
        <div>
          <label className="label">Difficulty</label>
          <select
            className="input"
            value={sub.difficulty}
            onChange={(e) => onChange({ ...sub, difficulty: e.target.value as Difficulty })}
          >
            <option value="EASY">EASY</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HARD">HARD</option>
            <option value="EXPERT">EXPERT</option>
          </select>
        </div>
      </div>
      {sub.question_type === "mcq_single" ? (
        <div style={{ marginTop: "0.75rem" }}>
          <label className="label">Options</label>
          {sub.options.map((o, i) => (
            <div key={`${o.key}-${i}`} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
              <input
                className="input"
                style={{ maxWidth: 100 }}
                value={o.key}
                onChange={(e) => {
                  const options = [...sub.options];
                  options[i] = { ...options[i], key: e.target.value };
                  onChange({ ...sub, options });
                }}
              />
              <input
                className="input"
                style={{ flex: 1, minWidth: 0 }}
                value={o.label}
                onChange={(e) => {
                  const options = [...sub.options];
                  options[i] = { ...options[i], label: e.target.value };
                  onChange({ ...sub, options });
                }}
                placeholder="Label"
              />
              <button
                type="button"
                className="btn btn-ghost"
                disabled={sub.options.length <= 2}
                onClick={() => {
                  const removedKey = sub.options[i]?.key.trim().toLowerCase();
                  const options = sub.options.filter((_, j) => j !== i);
                  let correctAnswer = sub.correct_answer;
                  if (removedKey && correctAnswer.trim().toLowerCase() === removedKey) {
                    correctAnswer = options.find((x) => x.key.trim())?.key.trim().toLowerCase() ?? "a";
                  }
                  onChange({ ...sub, options, correct_answer: correctAnswer });
                }}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={sub.options.length >= MCQ_MAX_OPTIONS}
            onClick={() => onChange({ ...sub, options: [...sub.options, { key: nextOptionKey(sub.options), label: "" }] })}
          >
            Add option
          </button>
        </div>
      ) : null}
      <div style={{ marginTop: "0.75rem" }}>
        <label className="label">{sub.question_type === "tita" ? "Expected answer" : "Correct answer (option key)"}</label>
        <input
          className="input"
          value={sub.correct_answer}
          onChange={(e) => onChange({ ...sub, correct_answer: e.target.value })}
          required
        />
      </div>
      <div style={{ marginTop: "0.75rem" }}>
        <label className="label">Explanation (optional)</label>
        <textarea className="input" rows={2} value={sub.explanation || ""} onChange={(e) => onChange({ ...sub, explanation: e.target.value })} />
      </div>
    </div>
  );
}

export function RcSetFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const isEdit = Boolean(id);

  const [title, setTitle] = useState("");
  const [passageText, setPassageText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [subject, setSubject] = useState("Verbal Ability");
  const [topic, setTopic] = useState("Reading Comprehension");
  const [examTag, setExamTag] = useState<ExamTag>("CAT");
  const [subQuestions, setSubQuestions] = useState<RcSubQuestionIn[]>([emptySubQuestion()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getRcSet(id)
      .then((set) => {
        setTitle(set.title);
        setPassageText(set.passage_text);
        setImageUrl(set.image_url?.trim() ?? "");
        setSubject(set.subject);
        setTopic(set.topic);
        const firstTag = (set.tags[0] || "CAT").toUpperCase();
        setExamTag((EXAM_TAGS.includes(firstTag as ExamTag) ? firstTag : "OTHER") as ExamTag);
        setSubQuestions(
          set.sub_questions.length
            ? set.sub_questions.map((sq) => ({
                id: sq.id,
                question_text: sq.question_text,
                question_type: sq.question_type,
                options: sq.options.length ? sq.options : sq.question_type === "tita" ? [] : defaultMcqOptions(),
                correct_answer: sq.correct_answer,
                explanation: sq.explanation || "",
                difficulty: sq.difficulty,
              }))
            : [emptySubQuestion()],
        );
      })
      .catch(() => toast.error("Failed to load RC set"))
      .finally(() => setLoading(false));
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: title.trim(),
      passage_text: passageText.trim(),
      image_url: imageUrl.trim() || null,
      subject: subject.trim(),
      topic: topic.trim(),
      tags: [examTag],
      sub_questions: subQuestions.map((sub) => ({
        id: sub.id ?? null,
        question_text: sub.question_text.trim(),
        question_type: sub.question_type,
        options:
          sub.question_type === "mcq_single"
            ? sub.options.filter((o) => o.label.trim())
            : sub.question_type === "true_false"
              ? sub.options
              : [],
        correct_answer: sub.correct_answer.trim(),
        explanation: sub.explanation?.trim() || null,
        difficulty: sub.difficulty,
      })),
    };
    setSaving(true);
    try {
      if (isEdit && id) {
        await updateRcSet(id, payload);
        toast.success("Saved");
      } else {
        await createRcSet(payload);
        toast.success("Created");
      }
      nav("/admin/rc-sets");
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : undefined;
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && isEdit) {
    return (
      <AdminPanel title="Edit RC set">
        <div className="skeleton" style={{ height: 400 }} />
      </AdminPanel>
    );
  }

  return (
    <AdminPanel
      title={isEdit ? "Edit RC set" : "New RC set"}
      actions={
        <Link to="/admin/rc-sets" className="btn btn-ghost">
          ← RC sets
        </Link>
      }
    >
      <form className="card" style={{ maxWidth: 860 }} onSubmit={onSubmit}>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Set title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Passage on climate policy" />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Passage text</label>
          <textarea className="input" rows={10} value={passageText} onChange={(e) => setPassageText(e.target.value)} required minLength={20} />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Passage image (optional)</label>
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
                  setImageUrl(await uploadQuestionImage(f));
                  toast.success("Image uploaded");
                } catch {
                  toast.error("Upload failed");
                } finally {
                  setImageUploading(false);
                }
              }}
            />
            {imageUrl ? (
              <button type="button" className="btn btn-ghost" onClick={() => setImageUrl("")}>
                Remove image
              </button>
            ) : null}
          </div>
          <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
          {imageUrl ? (
            <div style={{ marginTop: "0.65rem" }}>
              <img src={imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid var(--border)" }} />
            </div>
          ) : null}
        </div>
        <div className="grid-2" style={{ marginBottom: "1rem" }}>
          <div>
            <label className="label">Subject</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <label className="label">Topic</label>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} required />
          </div>
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label className="label">Exam category</label>
          <select className="input" value={examTag} onChange={(e) => setExamTag(e.target.value as ExamTag)}>
            {EXAM_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        <h3 style={{ margin: "0 0 0.75rem" }}>Sub-questions</h3>
        <p style={{ margin: "0 0 1rem", color: "var(--muted)", fontSize: "0.9rem" }}>
          Each sub-question is saved as a separate bank item linked to this passage. Students see the passage on the left and one sub-question at a time.
        </p>
        {subQuestions.map((sub, index) => (
          <SubQuestionEditor
            key={sub.id ?? `new-${index}`}
            index={index}
            sub={sub}
            canRemove={subQuestions.length > 1}
            onChange={(next) => setSubQuestions((prev) => prev.map((row, i) => (i === index ? next : row)))}
            onRemove={() => setSubQuestions((prev) => prev.filter((_, i) => i !== index))}
          />
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginBottom: "1.5rem" }}
          disabled={subQuestions.length >= 20}
          onClick={() => setSubQuestions((prev) => [...prev, emptySubQuestion()])}
        >
          Add sub-question
        </button>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save RC set"}
          </button>
          <Link to="/admin/rc-sets" className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </AdminPanel>
  );
}
