import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import type {
  QuestionBankFolderExam,
  QuestionBankFolderSubject,
  QuestionBankFolderTopic,
  QuestionPaperSection,
} from "../api/types";
import { useQuestionFolderTree } from "../lib/questionFolders";
import { QuestionBankFolderGrid, examTagLabel, subjectFolderLabel } from "./QuestionBankFolderGrid";

export const MAX_QUESTION_POOL = 2000;

export type QuestionFolderSelection = {
  examTag: string;
  subject: string | null;
  topic: string | null;
  questionIds: string[];
  label: string;
  pathLabel: string;
};

function uniqueIds(ids: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids ?? []) {
    const s = String(id || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function topicIds(topic: QuestionBankFolderTopic): string[] {
  return uniqueIds(topic.question_ids);
}

function subjectIds(subject: QuestionBankFolderSubject): string[] {
  const own = uniqueIds(subject.question_ids);
  if (own.length > 0) return own;
  return uniqueIds(subject.topics.flatMap(topicIds));
}

function examIds(exam: QuestionBankFolderExam): string[] {
  const own = uniqueIds(exam.question_ids);
  if (own.length > 0) return own;
  return uniqueIds(exam.subjects.flatMap(subjectIds));
}

export function applyFolderToSection(
  sec: QuestionPaperSection,
  sel: QuestionFolderSelection,
): QuestionPaperSection {
  const ids = sel.questionIds.slice(0, MAX_QUESTION_POOL);
  const titleIsDefault = !sec.title.trim() || /^section(\s+\d+)?$/i.test(sec.title.trim());
  return {
    ...sec,
    title: titleIsDefault ? sel.label : sec.title,
    exam_tag: sel.examTag || null,
    subject: sel.subject ?? "",
    topic: sel.topic ?? "",
    question_pool_ids: ids,
    total_questions: Math.min(Math.max(ids.length, 1), 100),
  };
}

export function QuestionFolderPicker({
  onUse,
}: {
  onUse: (selection: QuestionFolderSelection) => void;
}) {
  const { tree, loading } = useQuestionFolderTree();
  const [examTag, setExamTag] = useState("");
  const [subjectKey, setSubjectKey] = useState("");

  const selectedExam = useMemo(
    () => tree?.exams.find((e) => e.exam_tag === examTag) ?? null,
    [tree, examTag],
  );
  const selectedSubject = useMemo(
    () => selectedExam?.subjects.find((s) => s.subject === subjectKey) ?? null,
    [selectedExam, subjectKey],
  );

  const examFolders = useMemo(
    () =>
      (tree?.exams ?? []).map((row) => ({
        id: row.exam_tag,
        label: examTagLabel(row.exam_tag, row.display_name),
        mix: row.mix,
      })),
    [tree],
  );

  const subjectFolders = useMemo(
    () =>
      (selectedExam?.subjects ?? []).map((row) => ({
        id: row.subject,
        label: subjectFolderLabel(row.subject, row.display_name),
        mix: row.mix,
      })),
    [selectedExam],
  );

  const topicFolders = useMemo(
    () =>
      (selectedSubject?.topics ?? []).map((row) => ({
        id: row.topic,
        label: row.topic,
        mix: row.mix,
      })),
    [selectedSubject],
  );

  function emit(sel: QuestionFolderSelection) {
    if (sel.questionIds.length === 0) {
      toast.error("That folder has no questions yet");
      return;
    }
    onUse(sel);
  }

  function useExam(tag: string) {
    const exam = tree?.exams.find((e) => e.exam_tag === tag);
    if (!exam) return;
    emit({
      examTag: exam.exam_tag,
      subject: null,
      topic: null,
      questionIds: examIds(exam),
      label: examTagLabel(exam.exam_tag, exam.display_name),
      pathLabel: examTagLabel(exam.exam_tag, exam.display_name),
    });
  }

  function useSubject(subject: string) {
    const row = selectedExam?.subjects.find((s) => s.subject === subject);
    if (!selectedExam || !row) return;
    const examLabel = examTagLabel(selectedExam.exam_tag, selectedExam.display_name);
    const label = subjectFolderLabel(row.subject, row.display_name);
    emit({
      examTag: selectedExam.exam_tag,
      subject: row.subject,
      topic: null,
      questionIds: subjectIds(row),
      label,
      pathLabel: `${examLabel} / ${label}`,
    });
  }

  function useTopic(topic: string) {
    const row = selectedSubject?.topics.find((t) => t.topic === topic);
    if (!selectedExam || !selectedSubject || !row) return;
    const examLabel = examTagLabel(selectedExam.exam_tag, selectedExam.display_name);
    const subjectLabel = subjectFolderLabel(selectedSubject.subject, selectedSubject.display_name);
    emit({
      examTag: selectedExam.exam_tag,
      subject: selectedSubject.subject,
      topic: row.topic,
      questionIds: topicIds(row),
      label: row.topic,
      pathLabel: `${examLabel} / ${subjectLabel} / ${row.topic}`,
    });
  }

  function useCurrent() {
    if (selectedSubject && selectedExam) {
      useSubject(selectedSubject.subject);
      return;
    }
    if (selectedExam) {
      useExam(selectedExam.exam_tag);
    }
  }

  const atRoot = !examTag;
  const atExam = Boolean(examTag && !subjectKey);
  const atSubject = Boolean(examTag && subjectKey);
  const currentCount = atSubject
    ? selectedSubject
      ? subjectIds(selectedSubject).length
      : 0
    : atExam
      ? selectedExam
        ? examIds(selectedExam).length
        : 0
      : 0;

  return (
    <div>
      <nav className="qb-breadcrumb" aria-label="Folder location">
        <button
          type="button"
          className="qb-breadcrumb__link"
          onClick={() => {
            setExamTag("");
            setSubjectKey("");
          }}
        >
          Exam
        </button>
        {selectedExam ? (
          <>
            <span className="qb-breadcrumb__sep">/</span>
            {atExam ? (
              <span className="qb-breadcrumb__current">
                {examTagLabel(selectedExam.exam_tag, selectedExam.display_name)}
              </span>
            ) : (
              <button
                type="button"
                className="qb-breadcrumb__link"
                onClick={() => setSubjectKey("")}
              >
                {examTagLabel(selectedExam.exam_tag, selectedExam.display_name)}
              </button>
            )}
          </>
        ) : (
          <>
            <span className="qb-breadcrumb__sep">/</span>
            <span className="qb-breadcrumb__current">All categories</span>
          </>
        )}
        {selectedSubject ? (
          <>
            <span className="qb-breadcrumb__sep">/</span>
            <span className="qb-breadcrumb__current">
              {subjectFolderLabel(selectedSubject.subject, selectedSubject.display_name)}
            </span>
          </>
        ) : null}
      </nav>
      <p style={{ margin: "0.65rem 0 0.75rem", fontSize: "0.85rem", color: "var(--muted)" }}>
        {atRoot
          ? "Open a category to pick a subject or topic, or use a category folder as-is."
          : atExam
            ? "Use this category, or open a subject folder / use a subject directly."
            : "Use this subject, or use a topic folder inside it."}
      </p>
      {!atRoot ? (
        <div className="qb-transfer-bar">
          <span style={{ fontSize: "0.88rem" }}>
            {atSubject
              ? subjectFolderLabel(selectedSubject?.subject ?? "", selectedSubject?.display_name)
              : examTagLabel(selectedExam?.exam_tag ?? "", selectedExam?.display_name)}{" "}
            · {currentCount.toLocaleString()} question{currentCount === 1 ? "" : "s"}
          </span>
          <button type="button" className="btn btn-primary" onClick={useCurrent} disabled={currentCount <= 0}>
            Use this folder
          </button>
        </div>
      ) : null}
      {loading ? (
        <p className="empty">Loading folders…</p>
      ) : atSubject ? (
        <QuestionBankFolderGrid folders={topicFolders} onOpen={useTopic} onUse={useTopic} />
      ) : atExam ? (
        <QuestionBankFolderGrid
          folders={subjectFolders}
          onOpen={(id) => setSubjectKey(id)}
          onUse={useSubject}
        />
      ) : (
        <QuestionBankFolderGrid
          folders={examFolders}
          onOpen={(id) => {
            setExamTag(id);
            setSubjectKey("");
          }}
          onUse={useExam}
        />
      )}
    </div>
  );
}

export function QuestionFolderPickerModal({
  title = "Choose a folder",
  onUse,
  onClose,
}: {
  title?: string;
  onUse: (selection: QuestionFolderSelection) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="qb-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-picker-title"
      onClick={onClose}
    >
      <div className="qb-modal-card qb-modal-card--wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
          <h2 id="folder-picker-title" style={{ margin: 0, fontSize: "1.15rem" }}>
            {title}
          </h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p style={{ margin: "0.45rem 0 0.85rem", fontSize: "0.88rem", color: "var(--muted)" }}>
          Create the paper from every question in an exam category, a subject folder, or a topic subfolder.
        </p>
        <QuestionFolderPicker
          onUse={(sel) => {
            onUse(sel);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
