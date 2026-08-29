import { useCallback, useEffect, useState } from "react";
import { getQuestionFolderTree } from "../api/client";
import { examTagLabel } from "../components/QuestionBankFolderGrid";
import type { ExamTag, QuestionBankFolderTree } from "../api/types";

export const NEW_TOPIC_VALUE = "__new_topic__";
export const NEW_EXAM_VALUE = "__new_exam__";
export const FOLDER_TREE_CHANGED = "emgc-question-folder-tree-changed";

export const FALLBACK_EXAM_TAGS: ExamTag[] = ["CAT", "SSC", "BANK", "RAILWAY", "DEFENCE", "STATE", "OTHER"];

export function notifyFolderTreeChanged() {
  window.dispatchEvent(new Event(FOLDER_TREE_CHANGED));
}

export function folderExamKey(tag: string): string {
  const t = tag.trim().toUpperCase();
  return t === "OTHER" ? "OTHERS" : t;
}

export function uniqueSorted(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function examSelectValue(tag: string | null | undefined): string {
  const t = (tag ?? "").trim();
  if (!t) return "";
  return t.toUpperCase() === "OTHERS" ? "OTHER" : t;
}

export function topicsForFolder(
  tree: QuestionBankFolderTree | null,
  examTag: string,
  subject: string,
): string[] {
  const exam = tree?.exams.find((e) => e.exam_tag === folderExamKey(examTag));
  if (!exam) return [];
  const subjectKey = subject.trim();
  const subjectRow = subjectKey
    ? exam.subjects.find((s) => {
        const name = s.subject.toLowerCase();
        const display = (s.display_name || "").trim().toLowerCase();
        const key = subjectKey.toLowerCase();
        return name === key || (display !== "" && display === key);
      })
    : null;
  if (subjectRow) {
    return uniqueSorted(subjectRow.topics.map((t) => t.topic));
  }
  return uniqueSorted(exam.subjects.flatMap((s) => s.topics.map((t) => t.topic)));
}

export function subjectsForExam(tree: QuestionBankFolderTree | null, examTag: string): string[] {
  return subjectRowsForExam(tree, examTag).map((s) => s.value);
}

export function subjectRowsForExam(
  tree: QuestionBankFolderTree | null,
  examTag: string,
): Array<{ value: string; label: string }> {
  const exam = tree?.exams.find((e) => e.exam_tag === folderExamKey(examTag));
  if (!exam) return [];
  const seen = new Set<string>();
  const rows: Array<{ value: string; label: string }> = [];
  for (const s of exam.subjects) {
    const value = s.subject.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ value, label: s.display_name?.trim() || value });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function examOptionsFromTree(
  tree: QuestionBankFolderTree | null,
  extraValue?: string,
  opts?: { includeMixed?: boolean },
): Array<{ value: string; label: string }> {
  const fromTree = (tree?.exams ?? []).map((exam) => ({
    value: exam.exam_tag === "OTHERS" ? "OTHER" : exam.exam_tag,
    label: examTagLabel(exam.exam_tag, exam.display_name),
  }));
  const seen = new Set(fromTree.map((o) => o.value.toUpperCase()));
  const extras = FALLBACK_EXAM_TAGS.filter((tag) => !seen.has(tag)).map((tag) => ({
    value: tag,
    label: tag,
  }));
  const extra = extraValue?.trim();
  if (extra && extra !== NEW_EXAM_VALUE && !seen.has(extra.toUpperCase()) && !FALLBACK_EXAM_TAGS.includes(extra as ExamTag)) {
    extras.push({ value: extra, label: extra });
  }
  const rows = [...fromTree, ...extras];
  if (opts?.includeMixed) {
    return [{ value: "", label: "Mixed (all exams)" }, ...rows];
  }
  return rows;
}

export function useQuestionFolderTree() {
  const [tree, setTree] = useState<QuestionBankFolderTree | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setTree(await getQuestionFolderTree());
    } catch {
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const onChange = () => {
      void reload();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onChange();
    };
    window.addEventListener(FOLDER_TREE_CHANGED, onChange);
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(FOLDER_TREE_CHANGED, onChange);
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  return { tree, loading, reload };
}
