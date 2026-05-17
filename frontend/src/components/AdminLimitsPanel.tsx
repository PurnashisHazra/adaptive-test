import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { setSuperAdminUserAdminLimits } from "../api/client";
import type { AdminLimits, AdminLimitsUsage, Difficulty, ExamTag, SuperAdminUserRow } from "../api/types";

const EXAM_TAGS: ExamTag[] = ["CAT", "SSC", "BANK", "RAILWAY", "DEFENCE", "STATE", "OTHER"];
const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD", "EXPERT"];

export const DEFAULT_ADMIN_LIMITS: AdminLimits = {
  max_papers: null,
  max_students: null,
  max_monthly_student_attempts: null,
  question_bank_filter: { exam_tags: [], subjects: [], topics: [], difficulties: [] },
};

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function formatCap(used: number, max?: number | null) {
  if (max == null) return `${used} / ∞`;
  return `${used} / ${max}`;
}

export function AdminLimitsPanel({
  user,
  onSaved,
}: {
  user: SuperAdminUserRow;
  onSaved: () => void;
}) {
  const initial = useMemo(
    () => user.admin_limits ?? DEFAULT_ADMIN_LIMITS,
    [user.admin_limits],
  );
  const [maxPapers, setMaxPapers] = useState(initial.max_papers == null ? "" : String(initial.max_papers));
  const [maxStudents, setMaxStudents] = useState(initial.max_students == null ? "" : String(initial.max_students));
  const [maxAttempts, setMaxAttempts] = useState(
    initial.max_monthly_student_attempts == null ? "" : String(initial.max_monthly_student_attempts),
  );
  const [examTags, setExamTags] = useState<Set<string>>(new Set(initial.question_bank_filter.exam_tags));
  const [subjectsText, setSubjectsText] = useState(initial.question_bank_filter.subjects.join(", "));
  const [topicsText, setTopicsText] = useState(initial.question_bank_filter.topics.join(", "));
  const [difficulties, setDifficulties] = useState<Set<Difficulty>>(
    new Set(initial.question_bank_filter.difficulties),
  );
  const [saving, setSaving] = useState(false);

  const usage: AdminLimitsUsage | undefined = user.admin_limits_usage ?? undefined;

  function toggleExam(tag: string) {
    setExamTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function toggleDiff(d: Difficulty) {
    setDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function splitCsv(text: string): string[] {
    return text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function onSave() {
    setSaving(true);
    try {
      const limits: AdminLimits = {
        max_papers: parseOptionalInt(maxPapers),
        max_students: parseOptionalInt(maxStudents),
        max_monthly_student_attempts: parseOptionalInt(maxAttempts),
        question_bank_filter: {
          exam_tags: Array.from(examTags),
          subjects: splitCsv(subjectsText),
          topics: splitCsv(topicsText),
          difficulties: Array.from(difficulties),
        },
      };
      await setSuperAdminUserAdminLimits(user.username, limits);
      toast.success(`Limits saved for ${user.username}`);
      onSaved();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not save limits");
    } finally {
      setSaving(false);
    }
  }

  function onResetUnlimited() {
    setMaxPapers("");
    setMaxStudents("");
    setMaxAttempts("");
    setExamTags(new Set());
    setSubjectsText("");
    setTopicsText("");
    setDifficulties(new Set());
  }

  return (
    <div className="card admin-limits-panel">
      <p style={{ color: "var(--muted)", margin: "0 0 1rem", fontSize: "0.9rem" }}>
        Leave numeric fields empty for no limit. Question-bank filters are restrictive: only matching questions are visible.
        Empty filter lists mean no restriction on that dimension.
      </p>

      {usage ? (
        <div className="admin-limits-usage" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
          <span>Papers: {formatCap(usage.papers_count, parseOptionalInt(maxPapers) ?? initial.max_papers)}</span>
          <span>Students: {formatCap(usage.students_count, parseOptionalInt(maxStudents) ?? initial.max_students)}</span>
          <span>
            Monthly attempts:{" "}
            {formatCap(usage.monthly_attempts_count, parseOptionalInt(maxAttempts) ?? initial.max_monthly_student_attempts)}
          </span>
        </div>
      ) : null}

      <div className="admin-limits-grid">
        <div>
          <label className="label">Max question papers</label>
          <input className="input" value={maxPapers} onChange={(e) => setMaxPapers(e.target.value)} placeholder="Unlimited" />
        </div>
        <div>
          <label className="label">Max students (admin code)</label>
          <input className="input" value={maxStudents} onChange={(e) => setMaxStudents(e.target.value)} placeholder="Unlimited" />
        </div>
        <div>
          <label className="label">Max student attempts / month</label>
          <input className="input" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} placeholder="Unlimited" />
        </div>
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <label className="label">Question bank — exam tags</label>
        <div className="admin-limits-chips">
          {EXAM_TAGS.map((tag) => (
            <label key={tag} className="admin-limits-chip">
              <input type="checkbox" checked={examTags.has(tag)} onChange={() => toggleExam(tag)} />
              {tag}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label className="label">Question bank — difficulties</label>
        <div className="admin-limits-chips">
          {DIFFICULTIES.map((d) => (
            <label key={d} className="admin-limits-chip">
              <input type="checkbox" checked={difficulties.has(d)} onChange={() => toggleDiff(d)} />
              {d}
            </label>
          ))}
        </div>
      </div>

      <div className="admin-limits-grid" style={{ marginTop: "1rem" }}>
        <div>
          <label className="label">Subjects (comma-separated)</label>
          <input className="input" value={subjectsText} onChange={(e) => setSubjectsText(e.target.value)} placeholder="All subjects" />
        </div>
        <div>
          <label className="label">Topics (comma-separated)</label>
          <input className="input" value={topicsText} onChange={(e) => setTopicsText(e.target.value)} placeholder="All topics" />
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save limits"}
        </button>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onResetUnlimited}>
          Reset to unlimited
        </button>
      </div>
    </div>
  );
}
