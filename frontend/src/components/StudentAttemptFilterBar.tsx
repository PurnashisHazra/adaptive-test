import { useEffect, useMemo } from "react";
import type { StudentLearningTrendsResponse, StudentSessionFilters } from "../api/types";

function uniqSortedStrings(values: (string | null | undefined)[], cmp?: (a: string, b: string) => number): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = v != null && String(v).trim() ? String(v).trim() : "";
    if (s) set.add(s);
  }
  const arr = [...set];
  arr.sort(cmp ?? ((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
  return arr;
}

export function StudentAttemptFilterBar({
  data,
  value,
  onChange,
}: {
  data: StudentLearningTrendsResponse;
  value: StudentSessionFilters;
  onChange: (patch: Partial<StudentSessionFilters>) => void;
}) {
  const { subject, topic, exam } = value;

  const topicOptions = useMemo(() => {
    if (!data.points.length) return [];
    if (!subject) return uniqSortedStrings(data.points.map((p) => p.topic ?? null));
    return uniqSortedStrings(data.points.filter((p) => (p.subject ?? "") === subject).map((p) => p.topic ?? null));
  }, [data.points, subject]);

  const examOptions = useMemo(() => {
    if (!data.points.length) return [];
    let base = data.points;
    if (subject) base = base.filter((p) => (p.subject ?? "") === subject);
    if (topic) base = base.filter((p) => (p.topic ?? "") === topic);
    return uniqSortedStrings(base.map((p) => p.exam_tag ?? null), (a, b) => a.localeCompare(b));
  }, [data.points, subject, topic]);

  useEffect(() => {
    if (topic && !topicOptions.includes(topic)) onChange({ topic: "" });
  }, [topic, topicOptions, onChange]);

  useEffect(() => {
    if (exam && !examOptions.includes(exam)) onChange({ exam: "" });
  }, [exam, examOptions, onChange]);

  return (
    <div className="student-filter-grid">
      <label className="student-filter-grid__field">
        Subject
        <select
          className="input"
          value={subject}
          onChange={(e) => onChange({ subject: e.target.value, topic: "", exam: "" })}
        >
          <option value="">All subjects</option>
          {data.filter_options.subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="student-filter-grid__field">
        Topic
        <select className="input" value={topic} onChange={(e) => onChange({ topic: e.target.value, exam: "" })}>
          <option value="">All topics</option>
          {topicOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="student-filter-grid__field">
        Exam
        <select className="input" value={exam} onChange={(e) => onChange({ exam: e.target.value })}>
          <option value="">All exams</option>
          {examOptions.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
