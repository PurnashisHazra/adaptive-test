import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { createQuestion, getQuestion, updateQuestion, uploadQuestionImage } from "../../api/client";
import { AdminPanel } from "../../components/AdminPanel";
import type { Difficulty, ExamTag, QuestionOption, QuestionType } from "../../api/types";
import {
  FALLBACK_EXAM_TAGS,
  NEW_EXAM_VALUE,
  NEW_TOPIC_VALUE,
  examOptionsFromTree,
  folderExamKey,
  topicsForFolder,
  useQuestionFolderTree,
} from "../../lib/questionFolders";

function questionsBankHref(exam?: string, subject?: string, topic?: string): string {
  const p = new URLSearchParams();
  if (exam?.trim()) p.set("exam", folderExamKey(exam));
  if (subject?.trim()) p.set("subject", subject.trim());
  if (topic?.trim()) p.set("topic", topic.trim());
  const q = p.toString();
  return q ? `/admin/questions?${q}` : "/admin/questions";
}

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

function QuestionImageField({
  label,
  help,
  value,
  uploading,
  onChange,
  onUploading,
}: {
  label: string;
  help: string;
  value: string;
  uploading: boolean;
  onChange: (url: string) => void;
  onUploading: (busy: boolean) => void;
}) {
  return (
    <>
      <label className="label">{label}</label>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>{help}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="input"
          style={{ maxWidth: 280 }}
          disabled={uploading}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            onUploading(true);
            try {
              const url = await uploadQuestionImage(f);
              onChange(url);
              toast.success("Image uploaded");
            } catch (err: unknown) {
              const msg =
                err && typeof err === "object" && "response" in err
                  ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                  : undefined;
              toast.error(typeof msg === "string" ? msg : "Upload failed");
            } finally {
              onUploading(false);
            }
          }}
        />
        {uploading ? <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Uploading…</span> : null}
        {value ? (
          <button type="button" className="btn btn-ghost" onClick={() => onChange("")}>
            Remove image
          </button>
        ) : null}
      </div>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />
      {value ? (
        <div style={{ marginTop: "0.65rem" }}>
          <img src={value} alt="" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid var(--border)" }} />
        </div>
      ) : null}
    </>
  );
}

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
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const paramExam = (searchParams.get("exam") || "").trim().toUpperCase();
  const paramSubject = (searchParams.get("subject") || "").trim();
  const paramTopic = (searchParams.get("topic") || "").trim();

  const [questionText, setQuestionText] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("mcq_single");
  const [options, setOptions] = useState<QuestionOption[]>(defaultMcqOptions());
  const [correctAnswer, setCorrectAnswer] = useState("a");
  const [explanation, setExplanation] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [subject, setSubject] = useState(paramSubject || "General");
  const [topic, setTopic] = useState(paramTopic);
  const [addingNewTopic, setAddingNewTopic] = useState(false);
  const [examTag, setExamTag] = useState<string>(
    paramExam ? (paramExam === "OTHERS" ? "OTHER" : paramExam) : "CAT",
  );
  const [addingNewExam, setAddingNewExam] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [explanationImageUrl, setExplanationImageUrl] = useState("");
  const [explanationImageUploading, setExplanationImageUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const { tree: folderTree } = useQuestionFolderTree();

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
        setExamTag(FALLBACK_EXAM_TAGS.includes(firstTag as ExamTag) ? firstTag : firstTag === "OTHERS" ? "OTHER" : firstTag);
        setAddingNewExam(false);
        setAddingNewTopic(false);
        setImageUrl(q.image_url?.trim() ?? "");
        setExplanationImageUrl(q.explanation_image_url?.trim() ?? "");
      })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!examTag.trim()) {
      toast.error("Choose an exam category or add a new one");
      return;
    }
    if (!topic.trim()) {
      toast.error("Choose a topic or add a new one");
      return;
    }
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
      topic: topic.trim(),
      tags: [examTag.trim().toUpperCase()],
      image_url: imageUrl.trim() || null,
      explanation_image_url: explanationImageUrl.trim() || null,
    };
    try {
      if (isEdit && id) {
        await updateQuestion(id, body);
        toast.success("Saved");
      } else {
        await createQuestion(body);
        toast.success("Created");
      }
      nav(questionsBankHref(examTag, subject, topic.trim()));
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : undefined;
      toast.error(typeof msg === "string" ? msg : "Save failed");
    }
  }

  const topicOptions = useMemo(
    () => topicsForFolder(folderTree, examTag, subject),
    [folderTree, examTag, subject],
  );

  const examOptions = useMemo(
    () => examOptionsFromTree(folderTree, addingNewExam ? undefined : examTag),
    [folderTree, examTag, addingNewExam],
  );

  const backHref = questionsBankHref(paramExam || examTag, paramSubject || undefined, paramTopic || undefined);

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
        <Link to={backHref} className="btn btn-ghost">
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
          <QuestionImageField
            label="Image (optional)"
            help="Upload to Cloudflare R2 or paste a public image URL. Shown to students with the question."
            value={imageUrl}
            uploading={imageUploading}
            onChange={setImageUrl}
            onUploading={setImageUploading}
          />
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
            <p style={{ margin: "0 0 0.65rem", fontSize: "0.85rem", color: "var(--muted)" }}>
              Add as many choices as you need (up to {MCQ_MAX_OPTIONS}). Each option needs a unique key (shown to grading) and a label (shown to students).
            </p>
            {options.map((o, i) => (
              <div key={`${o.key}-${i}`} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
                <input
                  className="input"
                  style={{ maxWidth: 100 }}
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
                  style={{ flex: 1, minWidth: 0 }}
                  value={o.label}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = { ...next[i], label: e.target.value };
                    setOptions(next);
                  }}
                  placeholder="Label"
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ flexShrink: 0 }}
                  disabled={options.length <= 2}
                  onClick={() => {
                    const removedKey = options[i]?.key.trim().toLowerCase();
                    const next = options.filter((_, j) => j !== i);
                    setOptions(next);
                    if (removedKey && correctAnswer.trim().toLowerCase() === removedKey) {
                      const firstKey = next.find((x) => x.key.trim())?.key.trim().toLowerCase() ?? "a";
                      setCorrectAnswer(firstKey);
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: "0.35rem" }}
              disabled={options.length >= MCQ_MAX_OPTIONS}
              onClick={() => {
                setOptions((prev) => [...prev, { key: nextOptionKey(prev), label: "" }]);
              }}
            >
              Add option
            </button>
          </div>
        )}
        <div style={{ marginTop: "1rem" }}>
          <label className="label">
            {questionType === "tita" ? "Expected answer (exact match after trim & case ignore)" : "Correct answer (option key)"}
          </label>
          {questionType === "tita" ? (
            <input className="input" value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} required placeholder="e.g. 42 or Newton" />
          ) : questionType === "mcq_single" ? (
            <>
              <input
                className="input"
                list="mcq-correct-answer-keys"
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                required
                placeholder="Must match one option key (e.g. a, e, opt1)"
              />
              <datalist id="mcq-correct-answer-keys">
                {options
                  .filter((o) => o.key.trim())
                  .map((o) => (
                    <option key={o.key.trim().toLowerCase()} value={o.key.trim().toLowerCase()} />
                  ))}
              </datalist>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
                Keys are matched case-insensitively against your options above.
              </p>
            </>
          ) : (
            <input className="input" value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} required />
          )}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <label className="label">Explanation (optional)</label>
          <textarea className="input" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          <div style={{ marginTop: "0.75rem" }}>
            <QuestionImageField
              label="Explanation image (optional)"
              help="Upload to Cloudflare R2 or paste a public image URL. Shown with the explanation on review."
              value={explanationImageUrl}
              uploading={explanationImageUploading}
              onChange={setExplanationImageUrl}
              onUploading={setExplanationImageUploading}
            />
          </div>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <label className="label">Exam category</label>
          <select
            className="input"
            value={addingNewExam ? NEW_EXAM_VALUE : examTag}
            onChange={(e) => {
              const v = e.target.value;
              if (v === NEW_EXAM_VALUE) {
                setAddingNewExam(true);
                setExamTag("");
                setAddingNewTopic(false);
                if (!isEdit) setTopic("");
                return;
              }
              setAddingNewExam(false);
              setExamTag(v);
              setAddingNewTopic(false);
              if (!isEdit) setTopic("");
            }}
          >
            {examOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value={NEW_EXAM_VALUE}>+ New category</option>
          </select>
          {addingNewExam ? (
            <input
              className="input"
              style={{ marginTop: "0.5rem" }}
              value={examTag}
              onChange={(e) => setExamTag(e.target.value.toUpperCase())}
              placeholder="New exam category name"
              autoFocus
              required
            />
          ) : null}
        </div>
        <div className="grid-2" style={{ marginTop: "1rem" }}>
          <div>
            <label className="label">Subject</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="label">Topic</label>
            <select
              className="input"
              value={addingNewTopic ? NEW_TOPIC_VALUE : topic}
              onChange={(e) => {
                const v = e.target.value;
                if (v === NEW_TOPIC_VALUE) {
                  setAddingNewTopic(true);
                  setTopic("");
                  return;
                }
                setAddingNewTopic(false);
                setTopic(v);
              }}
              required={!addingNewTopic}
            >
              <option value="">{topicOptions.length === 0 ? "No topics yet" : "Select topic"}</option>
              {topic && !addingNewTopic && !topicOptions.some((t) => t.toLowerCase() === topic.toLowerCase()) ? (
                <option value={topic}>{topic}</option>
              ) : null}
              {topicOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value={NEW_TOPIC_VALUE}>+ New topic</option>
            </select>
            {addingNewTopic ? (
              <input
                className="input"
                style={{ marginTop: "0.5rem" }}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="New topic name"
                autoFocus
                required
              />
            ) : (
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
                {topicOptions.length > 0
                  ? `Showing ${topicOptions.length} topic${topicOptions.length === 1 ? "" : "s"} in this ${
                      folderTree?.exams
                        .find((e) => e.exam_tag === folderExamKey(examTag))
                        ?.subjects.some((s) => s.subject.toLowerCase() === subject.trim().toLowerCase())
                        ? "subject folder"
                        : "exam category"
                    }.`
                  : "No topics in this folder yet. Choose + New topic to add one."}
              </p>
            )}
          </div>
        </div>
        <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
          <Link to={backHref} className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </AdminPanel>
  );
}
