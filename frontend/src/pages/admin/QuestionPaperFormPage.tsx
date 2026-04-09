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
  listPaperAssignments,
  listStudentUsernames,
  syncPaperAssignments,
  updateQuestionPaper,
} from "../../api/client";
import type { AppConfig, QuestionPaperSection } from "../../api/types";

function SectionFilterFields({
  sec,
  cfg,
  subjects,
  onSubjectChange,
  onTopicChange,
}: {
  sec: QuestionPaperSection;
  cfg: AppConfig | null;
  subjects: string[];
  onSubjectChange: (subject: string) => void;
  onTopicChange: (topic: string) => void;
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

  if (!cfg) return null;

  const showSubject = cfg.subject_filter_enabled;
  const showTopic = cfg.topic_filter_enabled;

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
    <div
      className="grid-2"
      style={{
        marginBottom: "0.75rem",
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
  );
}

function newSection(): QuestionPaperSection {
  return {
    id: crypto.randomUUID(),
    title: "Section",
    order: 0,
    subject: "",
    topic: "",
    total_questions: 5,
    time_limit_seconds: 600,
  };
}

export function QuestionPaperFormPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const isNew = id === "new";

  const [title, setTitle] = useState("");
  const [marksCorrect, setMarksCorrect] = useState(1);
  const [marksIncorrect, setMarksIncorrect] = useState(0);
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
        setSections(
          p.sections.map((s, i) => ({
            id: s.id,
            title: s.title,
            order: s.order ?? i,
            subject: s.subject ?? "",
            topic: s.topic ?? "",
            total_questions: s.total_questions,
            time_limit_seconds: s.time_limit_seconds,
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
      sections: sections.map((s, i) => ({
        id: s.id,
        title: s.title.trim(),
        order: i,
        subject: s.subject?.trim() || null,
        topic: s.topic?.trim() || null,
        total_questions: s.total_questions,
        time_limit_seconds: s.time_limit_seconds,
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
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: 0 }}>Each section is an adaptive test with its own subject/topic filters, length, and time limit.</p>
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
