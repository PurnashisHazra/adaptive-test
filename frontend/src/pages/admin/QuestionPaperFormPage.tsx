import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { AdminPanel } from "../../components/AdminPanel";
import {
  createQuestionPaper,
  getConfig,
  getQuestionPaper,
  getTestSubjects,
  getTestTopics,
  listQuestions,
  listPaperAssignments,
  listStudentUsernames,
  syncPaperAssignments,
  updateQuestionPaper,
} from "../../api/client";
import type { AppConfig, Difficulty, ExamTag, QuestionAdmin, QuestionPaperSection } from "../../api/types";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

const EXAM_TAG_OPTIONS: Array<{ label: string; value: "" | ExamTag }> = [
  { label: "Mixed (all exams)", value: "" },
  { label: "CAT", value: "CAT" },
  { label: "SSC", value: "SSC" },
  { label: "BANK", value: "BANK" },
  { label: "RAILWAY", value: "RAILWAY" },
  { label: "DEFENCE", value: "DEFENCE" },
  { label: "STATE", value: "STATE" },
  { label: "OTHER", value: "OTHER" },
];

const POOL_DIFFICULTY_OPTIONS: Array<{ label: string; value: "" | Difficulty }> = [
  { label: "Any difficulty", value: "" },
  { label: "Easy", value: "EASY" },
  { label: "Medium", value: "MEDIUM" },
  { label: "Hard", value: "HARD" },
  { label: "Expert", value: "EXPERT" },
];

function generateSectionId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  const rnd = Math.random().toString(36).slice(2, 10);
  return `sec_${Date.now().toString(36)}_${rnd}`;
}

function SectionFilterFields({
  sec,
  cfg,
  subjects,
  onSubjectChange,
  onTopicChange,
  onExamTagChange,
}: {
  sec: QuestionPaperSection;
  cfg: AppConfig | null;
  subjects: string[];
  onSubjectChange: (subject: string) => void;
  onTopicChange: (topic: string) => void;
  onExamTagChange: (examTag: "" | ExamTag) => void;
}) {
  const [topics, setTopics] = useState<string[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);

  useEffect(() => {
    if (!cfg?.topic_filter_enabled) {
      setTopics([]);
      return;
    }
    let alive = true;
    setLoadingTopics(true);
    getTestTopics(cfg.subject_filter_enabled && sec.subject ? sec.subject : undefined)
      .then((ts) => {
        if (!alive) return;
        setTopics(ts);
      })
      .catch(() => {
        if (alive) setTopics([]);
      })
      .finally(() => {
        if (alive) setLoadingTopics(false);
      });
    return () => {
      alive = false;
    };
  }, [cfg?.topic_filter_enabled, cfg?.subject_filter_enabled, sec.subject]);

  const showSubject = Boolean(cfg?.subject_filter_enabled);
  const showTopic = Boolean(cfg?.topic_filter_enabled);

  if (!showSubject && !showTopic) {
    return (
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "var(--muted)" }}>
        Subject and topic filters are disabled in Settings; this section draws from the full question bank.
      </p>
    );
  }

  const subjectOptions = [...subjects];
  if (sec.subject && !subjectOptions.includes(sec.subject)) {
    subjectOptions.push(sec.subject);
    subjectOptions.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  const topicOptions = [...topics];
  if (sec.topic && !topicOptions.includes(sec.topic)) {
    topicOptions.push(sec.topic);
    topicOptions.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <div style={{ marginBottom: "0.75rem" }}>
        <label className="label">Exam category</label>
        <select className="input" value={(sec.exam_tag as "" | ExamTag | undefined) ?? ""} onChange={(e) => onExamTagChange(e.target.value as "" | ExamTag)}>
          {EXAM_TAG_OPTIONS.map((o) => (
            <option key={o.label} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div
        className="grid-2"
        style={{
          gridTemplateColumns: showSubject && showTopic ? undefined : "1fr",
        }}
      >
      {showSubject ? (
        <div>
          <label className="label">Subject (optional)</label>
          <select className="input" value={sec.subject ?? ""} onChange={(e) => onSubjectChange(e.target.value)}>
            <option value="">Any subject</option>
            {subjectOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {showTopic ? (
        <div>
          <label className="label">Topic (optional)</label>
          <select className="input" value={sec.topic ?? ""} onChange={(e) => onTopicChange(e.target.value)} disabled={loadingTopics}>
            <option value="">{loadingTopics ? "Loading…" : "Any topic"}</option>
            {topicOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      </div>
    </div>
  );
}

const MAX_QUESTION_POOL = 2000;
const POOL_PAGE_SIZE = 40;

function SectionQuestionPoolEditor({
  sec,
  setSection,
}: {
  sec: QuestionPaperSection;
  setSection: (next: QuestionPaperSection) => void;
}) {
  const pool = sec.question_pool_ids ?? [];
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const [browseExamTag, setBrowseExamTag] = useState<"" | ExamTag>("");
  const [browseDifficulty, setBrowseDifficulty] = useState<"" | Difficulty>("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [rows, setRows] = useState<QuestionAdmin[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listQuestions({
      page,
      page_size: POOL_PAGE_SIZE,
      subject: sec.subject?.trim() || undefined,
      topic: sec.topic?.trim() || undefined,
      search: debouncedSearch || undefined,
      difficulty: browseDifficulty || undefined,
      exam_tag: browseExamTag || undefined,
    })
      .then((res) => {
        if (!alive) return;
        setRows(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (alive) {
          setRows([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, debouncedSearch, sec.subject, sec.topic, browseDifficulty, browseExamTag]);

  const poolTooSmall = pool.length > 0 && pool.length < sec.total_questions;

  function mergeIds(add: string[]) {
    const s = new Set(pool);
    for (const id of add) {
      if (s.size >= MAX_QUESTION_POOL) break;
      s.add(id);
    }
    setSection({ ...sec, question_pool_ids: Array.from(s) });
  }

  function toggle(id: string) {
    const s = new Set(pool);
    if (s.has(id)) s.delete(id);
    else {
      if (s.size >= MAX_QUESTION_POOL) {
        toast.error(`At most ${MAX_QUESTION_POOL} questions per section.`);
        return;
      }
      s.add(id);
    }
    setSection({ ...sec, question_pool_ids: Array.from(s) });
  }

  function selectPage() {
    mergeIds(rows.map((q) => q.id));
  }

  async function selectAllMatchingFilters() {
    setBulkLoading(true);
    try {
      const merged = new Set(pool);
      let p = 1;
      const pageSize = 100;
      while (merged.size < MAX_QUESTION_POOL) {
        const res = await listQuestions({
          page: p,
          page_size: pageSize,
          subject: sec.subject?.trim() || undefined,
          topic: sec.topic?.trim() || undefined,
          search: debouncedSearch || undefined,
          difficulty: browseDifficulty || undefined,
          exam_tag: browseExamTag || undefined,
        });
        for (const q of res.items) {
          merged.add(q.id);
          if (merged.size >= MAX_QUESTION_POOL) break;
        }
        if (res.items.length < pageSize) break;
        p += 1;
        if (p > 60) break;
      }
      const next = Array.from(merged).slice(0, MAX_QUESTION_POOL);
      setSection({ ...sec, question_pool_ids: next });
      if (merged.size >= MAX_QUESTION_POOL) {
        toast(`Selected up to ${MAX_QUESTION_POOL} questions (maximum per section).`);
      }
    } catch {
      toast.error("Could not load questions from the bank");
    } finally {
      setBulkLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / POOL_PAGE_SIZE));

  return (
    <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
      <label className="label">Question set (optional)</label>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--muted)" }}>
        Leave empty to use the full bank with the section filters above. Use the bank browser (subject/topic from the
        section, plus optional exam category and difficulty) to pick questions; the section can still adapt difficulty
        within the selected set.
      </p>
      {poolTooSmall ? (
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "#b45309" }}>
          Selected {pool.length} question{pool.length === 1 ? "" : "s"}, but this section is set to{" "}
          {sec.total_questions}. Add more to the set or lower &quot;Questions in section&quot; before saving.
        </p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          {pool.length === 0 ? "Using full bank" : `${pool.length} selected`}
        </span>
        <button type="button" className="btn btn-ghost" onClick={selectPage} disabled={loading || rows.length === 0}>
          Select page
        </button>
        <button type="button" className="btn btn-ghost" onClick={selectAllMatchingFilters} disabled={bulkLoading || total === 0}>
          {bulkLoading ? "Loading…" : "Select all (current browse filters)"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setSection({ ...sec, question_pool_ids: [] })} disabled={pool.length === 0}>
          Clear set
        </button>
      </div>
      <div className="grid-2" style={{ marginBottom: "0.5rem", gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <label className="label" style={{ fontSize: "0.8rem" }}>
            Exam category (browse)
          </label>
          <select
            className="input"
            value={browseExamTag}
            onChange={(e) => {
              setBrowseExamTag(e.target.value as "" | ExamTag);
              setPage(1);
            }}
          >
            {EXAM_TAG_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.value === "" ? "Any category" : o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" style={{ fontSize: "0.8rem" }}>
            Difficulty (browse)
          </label>
          <select
            className="input"
            value={browseDifficulty}
            onChange={(e) => {
              setBrowseDifficulty(e.target.value as "" | Difficulty);
              setPage(1);
            }}
          >
            {POOL_DIFFICULTY_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ flex: "1 1 160px", minWidth: 120 }}
          placeholder="Search question text…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.35rem" }}>
        Bank preview (section subject/topic + browse filters){loading ? " — loading…" : ` — ${total} match`}
      </div>
      <div
        style={{
          maxHeight: 220,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "#fff",
        }}
      >
        {rows.length === 0 && !loading ? (
          <p style={{ padding: "0.75rem", margin: 0, color: "var(--muted)", fontSize: "0.85rem" }}>No questions match.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((q) => {
              const checked = pool.includes(q.id);
              const preview =
                q.question_text.length > 100 ? `${q.question_text.slice(0, 100)}…` : q.question_text;
              return (
                <li
                  key={q.id}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    padding: "0.35rem 0.5rem",
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "flex-start",
                    fontSize: "0.82rem",
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(q.id)} style={{ marginTop: 3 }} />
                  <button
                    type="button"
                    onClick={() => toggle(q.id)}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "#0f172a",
                    }}
                  >
                    <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>{q.difficulty}</span> · {preview}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {totalPages > 1 ? (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem", fontSize: "0.85rem" }}>
          <button type="button" className="btn btn-ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function newSection(): QuestionPaperSection {
  return {
    id: generateSectionId(),
    title: "Section",
    order: 0,
    subject: "",
    topic: "",
    exam_tag: null,
    total_questions: 5,
    time_limit_seconds: 600,
    question_pool_ids: [],
  };
}

export function QuestionPaperFormPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const isNew = !id || id === "new";

  const [title, setTitle] = useState("");
  const [marksCorrect, setMarksCorrect] = useState(1);
  const [marksIncorrect, setMarksIncorrect] = useState(0);
  const [isAdaptive, setIsAdaptive] = useState(true);
  const [sections, setSections] = useState<QuestionPaperSection[]>([newSection()]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [students, setStudents] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<{ student_username: string; assigned_at: string }[]>([]);
  const [checkedStudents, setCheckedStudents] = useState<Set<string>>(new Set());
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);

  useEffect(() => {
    listStudentUsernames()
      .then(setStudents)
      .catch(() => {});
  }, []);

  useEffect(() => {
    getConfig()
      .then(setCfg)
      .catch(() => toast.error("Could not load settings"));
  }, []);

  useEffect(() => {
    getTestSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, []);

  useEffect(() => {
    if (isNew) return;
    if (!id) return;
    setLoading(true);
    getQuestionPaper(id)
      .then((p) => {
        setTitle(p.title);
        setMarksCorrect(p.marks_per_correct);
        setMarksIncorrect(p.marks_per_incorrect);
        setIsAdaptive(p.is_adaptive ?? true);
        setSections(
          p.sections.map((s, i) => ({
            id: s.id,
            title: s.title,
            order: s.order ?? i,
            subject: s.subject ?? "",
            topic: s.topic ?? "",
            exam_tag: s.exam_tag ?? null,
            total_questions: s.total_questions,
            time_limit_seconds: s.time_limit_seconds,
            question_pool_ids: s.question_pool_ids?.length ? [...s.question_pool_ids] : [],
          }))
        );
        return listPaperAssignments(id);
      })
      .then(setAssignments)
      .catch(() => toast.error("Failed to load paper"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  useEffect(() => {
    setCheckedStudents(new Set(assignments.map((a) => a.student_username)));
  }, [assignments]);

  const assignmentRoster = useMemo(() => {
    const s = new Set<string>(students);
    assignments.forEach((a) => s.add(a.student_username));
    return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [students, assignments]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title required");
      return;
    }
    if (sections.length === 0) {
      toast.error("Add at least one section");
      return;
    }
    const payload = {
      title: title.trim(),
      marks_per_correct: marksCorrect,
      marks_per_incorrect: marksIncorrect,
      is_adaptive: isAdaptive,
      sections: sections.map((s, i) => ({
        id: s.id,
        title: s.title.trim(),
        order: i,
        subject: s.subject?.trim() || null,
        topic: s.topic?.trim() || null,
        exam_tag: s.exam_tag || null,
        total_questions: s.total_questions,
        time_limit_seconds: s.time_limit_seconds,
        question_pool_ids: s.question_pool_ids?.length ? s.question_pool_ids : null,
      })),
    };
    setSaving(true);
    try {
      if (isNew) {
        const p = await createQuestionPaper(payload);
        toast.success("Paper created");
        nav(`/admin/question-papers/${p.id}`, { replace: true });
      } else if (id) {
        await updateQuestionPaper(id, payload);
        toast.success("Saved");
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAssignments() {
    if (!id || isNew) return;
    setAssignmentSaving(true);
    try {
      await syncPaperAssignments(id, Array.from(checkedStudents));
      toast.success("Assignments saved");
      setAssignments(await listPaperAssignments(id));
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not save assignments");
    } finally {
      setAssignmentSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminPanel title="Question paper">
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </AdminPanel>
    );
  }

  return (
    <AdminPanel
      title={isNew ? "New question paper" : "Edit question paper"}
      actions={
        <Link to="/admin/question-papers" className="btn btn-ghost">
          ← All papers
        </Link>
      }
    >
      <form onSubmit={onSave} className="card" style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label" style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", cursor: "pointer" }}>
            <input type="checkbox" checked={isAdaptive} onChange={(e) => setIsAdaptive(e.target.checked)} style={{ marginTop: "0.2rem" }} />
            <span>
              <strong>Adaptive paper</strong>
              <span style={{ display: "block", color: "var(--muted)", fontSize: "0.88rem", fontWeight: 400, marginTop: "0.25rem" }}>
                When enabled, each section adapts difficulty question by question. When disabled, all questions are fixed up front and students can
                navigate freely, mark for review, and skip.
              </span>
            </span>
          </label>
        </div>
        <div className="grid-2" style={{ marginBottom: "1rem" }}>
          <div>
            <label className="label">Marks per correct answer</label>
            <input className="input" type="number" min={0.25} step={0.25} value={marksCorrect} onChange={(e) => setMarksCorrect(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Penalty per wrong answer</label>
            <input className="input" type="number" min={0} step={0.25} value={marksIncorrect} onChange={(e) => setMarksIncorrect(Number(e.target.value))} />
          </div>
        </div>
        <h3 style={{ marginBottom: "0.75rem" }}>Sections</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>
          {isAdaptive
            ? "Each section is an adaptive test with its own length and time limit."
            : "Each section presents a fixed set of questions with free navigation, mark for review, and skip."}{" "}
          Use subject/topic filters for the whole bank, or pick a question set below to restrict the section to specific questions.
        </p>
        {sections.map((sec, idx) => (
          <div key={sec.id} className="card" style={{ marginBottom: "1rem", background: "#f8fafc" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <strong>Section {idx + 1}</strong>
              {sections.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSections(sections.filter((s) => s.id !== sec.id))}
                >
                  Remove
                </button>
              )}
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label className="label">Section title</label>
              <input className="input" value={sec.title} onChange={(e) => setSections(sections.map((s) => (s.id === sec.id ? { ...s, title: e.target.value } : s)))} />
            </div>
            <SectionFilterFields
              sec={sec}
              cfg={cfg}
              subjects={subjects}
              onSubjectChange={(v) =>
                setSections(sections.map((s) => (s.id === sec.id ? { ...s, subject: v, topic: "" } : s)))
              }
              onTopicChange={(v) => setSections(sections.map((s) => (s.id === sec.id ? { ...s, topic: v } : s)))}
              onExamTagChange={(v) => setSections(sections.map((s) => (s.id === sec.id ? { ...s, exam_tag: v || null } : s)))}
            />
            <SectionQuestionPoolEditor
              sec={sec}
              setSection={(next) => setSections(sections.map((s) => (s.id === sec.id ? next : s)))}
            />
            <div className="grid-2">
              <div>
                <label className="label">Questions in section</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={100}
                  value={sec.total_questions}
                  onChange={(e) =>
                    setSections(sections.map((s) => (s.id === sec.id ? { ...s, total_questions: Number(e.target.value) } : s)))
                  }
                />
              </div>
              <div>
                <label className="label">Section time (seconds)</label>
                <input
                  className="input"
                  type="number"
                  min={60}
                  max={7200}
                  value={sec.time_limit_seconds}
                  onChange={(e) =>
                    setSections(sections.map((s) => (s.id === sec.id ? { ...s, time_limit_seconds: Number(e.target.value) } : s)))
                  }
                />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" onClick={() => setSections([...sections, newSection()])} style={{ marginBottom: "1rem" }}>
          Add section
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      {!isNew && id ? (
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <h3 style={{ marginTop: 0 }}>Assign to students</h3>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Check every student who should receive this paper, then save. Unchecked students are unassigned from this paper only.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setCheckedStudents(new Set(assignmentRoster))}
              disabled={assignmentRoster.length === 0}
            >
              Select all
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCheckedStudents(new Set())}>
              Clear all
            </button>
            <button type="button" className="btn btn-primary" onClick={onSaveAssignments} disabled={assignmentSaving}>
              {assignmentSaving ? "Saving…" : "Save assignments"}
            </button>
          </div>
          {assignmentRoster.length > 0 ? (
            <ul
              style={{
                marginTop: "1rem",
                paddingLeft: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
                maxHeight: 280,
                overflowY: "auto",
              }}
            >
              {assignmentRoster.map((u) => (
                <li key={u}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={checkedStudents.has(u)}
                      onChange={(e) => {
                        setCheckedStudents((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(u);
                          else n.delete(u);
                          return n;
                        });
                      }}
                    />
                    <span>{u}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--muted)", marginTop: "0.75rem" }}>No student accounts found. Add students before assigning.</p>
          )}
        </div>
      ) : null}
    </AdminPanel>
  );
}
