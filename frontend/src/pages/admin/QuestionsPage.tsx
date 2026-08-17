import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  autoAssignQuestionDifficulties,
  bulkCopyQuestionFolders,
  bulkMoveQuestionFolders,
  copyQuestionFolder,
  copyQuestionsToFolder,
  countQuestions,
  createQuestion,
  createQuestionCategory,
  createQuestionSubjectFolder,
  deleteAllQuestions,
  deleteQuestion,
  deleteQuestionCategory,
  deleteQuestionSubjectFolder,
  deleteQuestionTopicFolder,
  downloadQuestionsCsv,
  generateAiQuestionDraft,
  getQuestionFolderTree,
  listQuestions,
  moveQuestionFolder,
  moveQuestionsToFolder,
  renameQuestionCategory,
  renameQuestionSubjectFolder,
} from "../../api/client";
import type { Difficulty, QuestionAdmin, QuestionBankFolderTree, QuestionCreatePayload, QuestionType } from "../../api/types";
import { AdminFilterShell } from "../../components/AdminFilterShell";
import { AdminPanel } from "../../components/AdminPanel";
import { QuestionBankFolderGrid, examTagLabel, subjectFolderLabel } from "../../components/QuestionBankFolderGrid";

type SelectedFolder = { level: "exam" | "subject" | "topic"; key: string; label: string; count: number };

type FolderModal =
  | { kind: "create-category" }
  | { kind: "create-subject" }
  | { kind: "rename-category"; key: string; label: string }
  | { kind: "rename-subject"; key: string; label: string }
  | { kind: "delete-category"; key: string; label: string; count: number }
  | { kind: "delete-subject"; key: string; label: string; count: number }
  | { kind: "delete-topic"; key: string; label: string; count: number }
  | { kind: "transfer-folders"; mode: "move" | "copy"; level: "exam" | "subject" | "topic"; folders: SelectedFolder[] }
  | { kind: "move-copy"; mode: "move" | "copy" };

function normalizeExamTag(name: string): string {
  const t = name.trim().split(/\s+/).join(" ").toUpperCase();
  return (t || "OTHER").slice(0, 64);
}

function apiErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (item && typeof item === "object" && "msg" in item) return String((item as { msg: string }).msg);
          return String(item);
        })
        .join(" · ");
    }
  }
  return "Action failed";
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function QuestionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const examTag = (searchParams.get("exam") || "").trim().toUpperCase();
  const subjectFolder = (searchParams.get("subject") || "").trim();
  const topicFolder = (searchParams.get("topic") || "").trim();

  const [items, setItems] = useState<QuestionAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [globalQuestionCount, setGlobalQuestionCount] = useState(0);
  const [folderTree, setFolderTree] = useState<QuestionBankFolderTree | null>(null);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [questionType, setQuestionType] = useState<QuestionType | "">("");
  const [search, setSearch] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiApproving, setAiApproving] = useState(false);
  const [aiDraft, setAiDraft] = useState<QuestionCreatePayload | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [assigningDifficulty, setAssigningDifficulty] = useState(false);
  const [folderModal, setFolderModal] = useState<FolderModal | null>(null);
  const [folderModalInput, setFolderModalInput] = useState("");
  const [folderModalBusy, setFolderModalBusy] = useState(false);
  const [transferExam, setTransferExam] = useState("");
  const [transferSubject, setTransferSubject] = useState("");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [transferBusy, setTransferBusy] = useState(false);

  const pageSize = 15;
  const debouncedSearch = useDebouncedValue(search.trim(), 400);
  const prevDebouncedSearch = useRef<string | null>(null);
  const inQuestionList = Boolean(examTag && subjectFolder && topicFolder);
  const atTopicLevel = Boolean(examTag && subjectFolder && !topicFolder);
  const atSubjectLevel = Boolean(examTag && !subjectFolder);
  const atExamLevel = !examTag;

  const selectedExam = useMemo(
    () => folderTree?.exams.find((e) => e.exam_tag === examTag) ?? null,
    [folderTree, examTag],
  );

  const selectedSubject = useMemo(
    () => selectedExam?.subjects.find((s) => s.subject === subjectFolder) ?? null,
    [selectedExam, subjectFolder],
  );

  async function loadFolderTree() {
    setFoldersLoading(true);
    try {
      setFolderTree(await getQuestionFolderTree());
    } catch {
      toast.error("Failed to load question folders");
    } finally {
      setFoldersLoading(false);
    }
  }

  async function loadWithPage(p: number) {
    if (!inQuestionList) return;
    setLoading(true);
    try {
      const [res, allN] = await Promise.all([
        listQuestions({
          page: p,
          page_size: pageSize,
          subject: subjectFolder,
          topic: topicFolder,
          difficulty: difficulty || undefined,
          question_type: questionType || undefined,
          search: debouncedSearch || undefined,
          exam_tag: examTag,
        }),
        countQuestions(),
      ]);
      setItems(res.items);
      setTotal(res.total);
      setGlobalQuestionCount(allN);
    } catch {
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFolderTree();
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedQuestionIds([]);
    setSelectedFolderIds([]);
  }, [examTag, subjectFolder, topicFolder]);

  useEffect(() => {
    if (!inQuestionList) return;
    const searchChanged =
      prevDebouncedSearch.current !== null && prevDebouncedSearch.current !== debouncedSearch;
    prevDebouncedSearch.current = debouncedSearch;

    if (searchChanged && page !== 1) {
      setPage(1);
      return;
    }
    void loadWithPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, inQuestionList, examTag, subjectFolder, topicFolder, difficulty, questionType]);

  async function load() {
    await loadWithPage(page);
    await loadFolderTree();
  }

  function openExam(tag: string) {
    setSearchParams({ exam: tag });
  }

  function openSubject(subject: string) {
    setSearchParams({ exam: examTag, subject });
  }

  function openTopic(topic: string) {
    setSearchParams({ exam: examTag, subject: subjectFolder, topic });
  }

  function goToRoot() {
    setSearchParams({});
  }

  function goToExam() {
    setSearchParams({ exam: examTag });
  }

  function goToSubject() {
    setSearchParams({ exam: examTag, subject: subjectFolder });
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this question?")) return;
    try {
      await deleteQuestion(id);
      toast.success("Deleted");
      await load();
    } catch {
      toast.error("Delete failed");
    }
  }

  async function onDownloadCsv() {
    setExportingCsv(true);
    try {
      await downloadQuestionsCsv();
      toast.success("Download started");
    } catch {
      toast.error("CSV export failed");
    } finally {
      setExportingCsv(false);
    }
  }

  async function onDeleteAll() {
    if (!window.confirm(`Delete all ${globalQuestionCount} question(s) in the bank? This cannot be undone.`)) return;
    if (window.prompt('Type DELETE ALL to confirm (capital letters).') !== "DELETE ALL") {
      toast.error("Cancelled");
      return;
    }
    setDeletingAll(true);
    try {
      const n = await deleteAllQuestions();
      toast.success(`Removed ${n} question(s)`);
      setPage(1);
      await load();
    } catch {
      toast.error("Delete all failed");
    } finally {
      setDeletingAll(false);
    }
  }

  async function onGenerateAiDraft() {
    if (!aiPrompt.trim()) {
      toast.error("Please enter a prompt.");
      return;
    }
    setAiGenerating(true);
    try {
      const draft = await generateAiQuestionDraft({
        prompt: aiPrompt.trim(),
        subject: subjectFolder || undefined,
        topic: topicFolder || undefined,
      });
      setAiDraft(draft);
      toast.success("AI draft generated");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not generate draft");
    } finally {
      setAiGenerating(false);
    }
  }

  async function onAutoAssignDifficulty() {
    if (items.length === 0) {
      toast.error("No questions on this page.");
      return;
    }
    if (
      !window.confirm(
        `Use AdapTest AI to set difficulty for ${items.length} question(s) on this page, using each question’s text and exam tags? This uses your API key and may take a little while.`,
      )
    ) {
      return;
    }
    setAssigningDifficulty(true);
    try {
      const res = await autoAssignQuestionDifficulties({ question_ids: items.map((q) => q.id) });
      if (res.updated > 0) {
        toast.success(`Updated difficulty for ${res.updated} question(s).`);
      }
      if (res.errors.length > 0) {
        const msg = res.errors.slice(0, 4).join(" · ");
        toast.error(res.errors.length > 4 ? `${msg}…` : msg);
      } else if (res.updated === 0) {
        toast.error("No questions were updated. Check the Adaptest AI key and try again.");
      }
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Auto-assign difficulty failed");
    } finally {
      setAssigningDifficulty(false);
    }
  }

  async function onApproveAiDraft() {
    if (!aiDraft) return;
    setAiApproving(true);
    try {
      await createQuestion(aiDraft);
      toast.success("AI question added");
      setShowAiModal(false);
      setAiDraft(null);
      setAiPrompt("");
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Failed to add AI question");
    } finally {
      setAiApproving(false);
    }
  }

  function openCreateCategory() {
    setFolderModalInput("");
    setFolderModal({ kind: "create-category" });
  }

  function openCreateSubject() {
    setFolderModalInput("");
    setFolderModal({ kind: "create-subject" });
  }

  function openRenameCategory(key: string) {
    const exam = folderTree?.exams.find((e) => e.exam_tag === key);
    setFolderModalInput(exam?.display_name || examTagLabel(key, exam?.display_name));
    setFolderModal({ kind: "rename-category", key, label: examTagLabel(key, exam?.display_name) });
  }

  function openRenameSubject(key: string) {
    const row = selectedSubject?.subject === key ? selectedSubject : selectedExam?.subjects.find((s) => s.subject === key);
    setFolderModalInput(row?.display_name || row?.subject || key);
    setFolderModal({ kind: "rename-subject", key, label: subjectFolderLabel(key, row?.display_name) });
  }

  function openDeleteCategory(key: string) {
    const exam = folderTree?.exams.find((e) => e.exam_tag === key);
    setFolderModal({
      kind: "delete-category",
      key,
      label: examTagLabel(key, exam?.display_name),
      count: exam?.mix.total ?? 0,
    });
  }

  function openDeleteSubject(key: string) {
    const row = selectedSubject?.subject === key ? selectedSubject : selectedExam?.subjects.find((s) => s.subject === key);
    setFolderModal({
      kind: "delete-subject",
      key,
      label: subjectFolderLabel(key, row?.display_name),
      count: row?.mix.total ?? 0,
    });
  }

  function openTransferFolders(mode: "move" | "copy", folders: SelectedFolder[]) {
    if (folders.length === 0) return;
    const level = folders[0].level;
    setTransferExam("");
    setFolderModal({ kind: "transfer-folders", mode, level, folders });
  }

  function buildTransferDestPath(
    level: "exam" | "subject" | "topic",
    destExam: string,
    first: SelectedFolder,
  ) {
    const to_path: { exam_tag: string; subject?: string; topic?: string } = { exam_tag: destExam };
    if (level === "subject") {
      to_path.subject = first.key;
    } else if (level === "topic") {
      to_path.subject = subjectFolder;
      to_path.topic = first.key;
    }
    return to_path;
  }

  function transferDestNav(
    level: "exam" | "subject" | "topic",
    destExam: string,
    first: SelectedFolder,
  ): Record<string, string> | null {
    if (level === "exam") return { exam: destExam };
    if (level === "subject") return { exam: destExam, subject: first.key };
    if (level === "topic") return { exam: destExam, subject: subjectFolder, topic: first.key };
    return null;
  }

  function openMoveCategory(key: string) {
    const exam = folderTree?.exams.find((e) => e.exam_tag === key);
    openTransferFolders("move", [
      { level: "exam", key, label: examTagLabel(key, exam?.display_name), count: exam?.mix.total ?? 0 },
    ]);
  }

  function openCopyCategory(key: string) {
    const exam = folderTree?.exams.find((e) => e.exam_tag === key);
    openTransferFolders("copy", [
      { level: "exam", key, label: examTagLabel(key, exam?.display_name), count: exam?.mix.total ?? 0 },
    ]);
  }

  function openMoveSubject(key: string) {
    const row = selectedSubject?.subject === key ? selectedSubject : selectedExam?.subjects.find((s) => s.subject === key);
    openTransferFolders("move", [
      {
        level: "subject",
        key,
        label: subjectFolderLabel(key, row?.display_name),
        count: row?.mix.total ?? 0,
      },
    ]);
  }

  function openCopySubject(key: string) {
    const row = selectedSubject?.subject === key ? selectedSubject : selectedExam?.subjects.find((s) => s.subject === key);
    openTransferFolders("copy", [
      {
        level: "subject",
        key,
        label: subjectFolderLabel(key, row?.display_name),
        count: row?.mix.total ?? 0,
      },
    ]);
  }

  function openMoveTopic(key: string) {
    const row = selectedSubject?.topics.find((t) => t.topic === key);
    openTransferFolders("move", [{ level: "topic", key, label: key, count: row?.mix.total ?? 0 }]);
  }

  function openCopyTopic(key: string) {
    const row = selectedSubject?.topics.find((t) => t.topic === key);
    openTransferFolders("copy", [{ level: "topic", key, label: key, count: row?.mix.total ?? 0 }]);
  }

  function folderPathFromSelection(f: SelectedFolder) {
    if (f.level === "exam") return { exam_tag: f.key };
    if (f.level === "subject") return { exam_tag: examTag, subject: f.key };
    return { exam_tag: examTag, subject: subjectFolder, topic: f.key };
  }

  function toggleFolderSelection(id: string) {
    setSelectedFolderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectedFoldersForLevel(level: "exam" | "subject" | "topic"): SelectedFolder[] {
    if (level === "exam") {
      return examFolders
        .filter((f) => selectedFolderIds.includes(f.id))
        .map((f) => ({ level: "exam" as const, key: f.id, label: f.label, count: f.mix.total }));
    }
    if (level === "subject") {
      return subjectFolders
        .filter((f) => selectedFolderIds.includes(f.id))
        .map((f) => ({ level: "subject" as const, key: f.id, label: f.label, count: f.mix.total }));
    }
    return topicFolders
      .filter((f) => selectedFolderIds.includes(f.id))
      .map((f) => ({ level: "topic" as const, key: f.id, label: f.label, count: f.mix.total }));
  }

  function openBulkTransferFolders(mode: "move" | "copy") {
    const level = atTopicLevel ? "topic" : atSubjectLevel ? "subject" : "exam";
    const folders = selectedFoldersForLevel(level);
    if (folders.length === 0) {
      toast.error("Select at least one folder");
      return;
    }
    openTransferFolders(mode, folders);
  }

  function openDeleteTopic(key: string) {
    const row = selectedSubject?.topics.find((t) => t.topic === key);
    setFolderModal({
      kind: "delete-topic",
      key,
      label: key,
      count: row?.mix.total ?? 0,
    });
  }

  async function submitFolderModal() {
    if (!folderModal) return;
    setFolderModalBusy(true);
    let postMoveNav: Record<string, string> | null = null;
    try {
      if (folderModal.kind === "create-category") {
        const name = folderModalInput.trim();
        if (!name) {
          toast.error("Enter a category name");
          return;
        }
        await createQuestionCategory(name);
        toast.success("Category created");
      } else if (folderModal.kind === "create-subject") {
        const name = folderModalInput.trim();
        if (!name) {
          toast.error("Enter a subject folder name");
          return;
        }
        await createQuestionSubjectFolder(examTag, name);
        toast.success("Subject folder created");
      } else if (folderModal.kind === "rename-category") {
        const name = folderModalInput.trim();
        if (!name) {
          toast.error("Enter a name");
          return;
        }
        const res = await renameQuestionCategory(folderModal.key, { new_name: name, display_name: name });
        toast.success(res.affected > 0 ? `Renamed category (${res.affected} question(s) updated)` : "Category renamed");
        const newKey = normalizeExamTag(name);
        if (examTag === folderModal.key && newKey !== folderModal.key) {
          setSearchParams({ exam: newKey });
        }
      } else if (folderModal.kind === "rename-subject") {
        const name = folderModalInput.trim();
        if (!name) {
          toast.error("Enter a name");
          return;
        }
        const res = await renameQuestionSubjectFolder(examTag, folderModal.key, name);
        toast.success(res.affected > 0 ? `Renamed folder (${res.affected} question(s) updated)` : "Folder renamed");
        if (subjectFolder === folderModal.key && name !== folderModal.key) {
          setSearchParams({ exam: examTag, subject: name });
        }
      } else if (folderModal.kind === "delete-category") {
        const res = await deleteQuestionCategory(folderModal.key);
        toast.success(
          res.affected > 0 ? `Category deleted (${res.affected} question(s) removed)` : "Category deleted",
        );
        if (examTag === folderModal.key) setSearchParams({});
      } else if (folderModal.kind === "delete-subject") {
        const res = await deleteQuestionSubjectFolder(examTag, folderModal.key);
        toast.success(
          res.affected > 0 ? `Folder deleted (${res.affected} question(s) removed)` : "Folder deleted",
        );
        if (subjectFolder === folderModal.key) setSearchParams({ exam: examTag });
      } else if (folderModal.kind === "delete-topic") {
        const res = await deleteQuestionTopicFolder(examTag, subjectFolder, folderModal.key);
        toast.success(
          res.affected > 0 ? `Topic deleted (${res.affected} question(s) removed)` : "Topic deleted",
        );
        if (topicFolder === folderModal.key) setSearchParams({ exam: examTag, subject: subjectFolder });
      } else if (folderModal.kind === "transfer-folders") {
        const destExam = normalizeExamTag(transferExam);
        if (!destExam) {
          toast.error("Choose a destination exam category");
          return;
        }

        const from_paths = folderModal.folders.map(folderPathFromSelection);
        const single = folderModal.folders.length === 1;
        const first = folderModal.folders[0];
        const destNav = transferDestNav(folderModal.level, destExam, first);

        if (single) {
          const to_path = buildTransferDestPath(folderModal.level, destExam, first);

          if (folderModal.mode === "move") {
            const res = await moveQuestionFolder({ from_path: from_paths[0], to_path });
            toast.success(`Moved folder (${res.affected} question(s) updated)`);
            postMoveNav = destNav;
          } else {
            const res = await copyQuestionFolder({ from_path: from_paths[0], to_path });
            toast.success(`Copied folder (${res.affected} question(s))`);
            postMoveNav = destNav;
          }
        } else {
          const body = { from_paths, to_exam_tag: destExam };

          if (folderModal.mode === "move") {
            const res = await bulkMoveQuestionFolders(body);
            toast.success(res.message || `Moved ${folderModal.folders.length} folder(s)`);
          } else {
            const res = await bulkCopyQuestionFolders(body);
            toast.success(res.message || `Copied ${folderModal.folders.length} folder(s)`);
          }
          postMoveNav =
            folderModal.level === "topic" && subjectFolder
              ? { exam: destExam, subject: subjectFolder }
              : destNav;
        }
        setSelectedFolderIds([]);
      } else if (folderModal.kind === "move-copy") {
        if (selectedQuestionIds.length === 0) {
          toast.error("Select at least one question");
          return;
        }
        if (!transferExam.trim() || !transferSubject.trim()) {
          toast.error("Choose destination category and subject");
          return;
        }
        setTransferBusy(true);
        if (folderModal.mode === "move") {
          const res = await moveQuestionsToFolder({
            question_ids: selectedQuestionIds,
            from_exam_tag: examTag,
            to_exam_tag: transferExam.trim().toUpperCase(),
            to_subject: transferSubject.trim(),
          });
          toast.success(`Moved ${res.affected} question(s)`);
          setSelectedQuestionIds([]);
        } else {
          const res = await copyQuestionsToFolder({
            question_ids: selectedQuestionIds,
            to_exam_tag: transferExam.trim().toUpperCase(),
            to_subject: transferSubject.trim(),
          });
          toast.success(`Copied ${res.copied} question(s)`);
        }
      }
      setFolderModal(null);
      await loadFolderTree();
      if (postMoveNav) setSearchParams(postMoveNav);
      if (inQuestionList) await loadWithPage(page);
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err));
    } finally {
      setFolderModalBusy(false);
      setTransferBusy(false);
    }
  }

  function toggleQuestionSelection(id: string) {
    setSelectedQuestionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAllOnPage() {
    if (items.length === 0) return;
    const pageIds = items.map((q) => q.id);
    const allSelected = pageIds.every((id) => selectedQuestionIds.includes(id));
    if (allSelected) {
      setSelectedQuestionIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedQuestionIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  }

  function openMoveCopy(mode: "move" | "copy") {
    setTransferExam(examTag);
    setTransferSubject(subjectFolder);
    setFolderModal({ kind: "move-copy", mode });
  }

  const transferSubjectOptions = useMemo(() => {
    const exam = folderTree?.exams.find((e) => e.exam_tag === transferExam.trim().toUpperCase());
    return exam?.subjects.map((s) => s.subject) ?? [];
  }, [folderTree, transferExam]);

  const examFolders = useMemo(
    () =>
      (folderTree?.exams ?? []).map((exam) => ({
        id: exam.exam_tag,
        label: examTagLabel(exam.exam_tag, exam.display_name),
        subtitle: `${exam.subjects.length} subject${exam.subjects.length === 1 ? "" : "s"}`,
        mix: exam.mix,
      })),
    [folderTree],
  );

  const subjectFolders = useMemo(
    () =>
      (selectedExam?.subjects ?? []).map((row) => ({
        id: row.subject,
        label: subjectFolderLabel(row.subject, row.display_name),
        subtitle: `${row.topics.length} topic${row.topics.length === 1 ? "" : "s"}`,
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

  const panelTitle = inQuestionList
    ? topicFolder
    : atTopicLevel
      ? subjectFolderLabel(subjectFolder, selectedSubject?.display_name)
      : atSubjectLevel
        ? examTagLabel(examTag, selectedExam?.display_name)
        : "Question bank";

  return (
    <AdminPanel
      title={panelTitle}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onDownloadCsv} disabled={exportingCsv}>
            {exportingCsv ? "Exporting…" : "Download CSV"}
          </button>
          <button type="button" className="btn btn-danger" onClick={onDeleteAll} disabled={deletingAll || globalQuestionCount === 0}>
            {deletingAll ? "Deleting…" : "Delete all"}
          </button>
          {inQuestionList ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => openMoveCopy("move")}
                disabled={selectedQuestionIds.length === 0}
              >
                Move selected
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => openMoveCopy("copy")}
                disabled={selectedQuestionIds.length === 0}
              >
                Copy selected
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onAutoAssignDifficulty}
                disabled={assigningDifficulty || loading || items.length === 0}
                title="Assigns EASY/MEDIUM/HARD/EXPERT using Adaptest AI from question text and exam category tags (current page only, max 30)."
              >
                {assigningDifficulty ? "Assigning…" : "Auto assign difficulty"}
              </button>
            </>
          ) : atSubjectLevel ? (
            <button type="button" className="btn btn-primary" onClick={openCreateSubject}>
              Add subject folder
            </button>
          ) : atExamLevel ? (
            <button type="button" className="btn btn-primary" onClick={openCreateCategory}>
              Add category
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={() => setShowAiModal(true)}>
            AI-Add Question
          </button>
          <Link to="/admin/questions/new" className="btn btn-primary">
            Add question
          </Link>
        </>
      }
      filters={
        inQuestionList ? (
          <AdminFilterShell>
            <nav className="qb-breadcrumb" aria-label="Question bank location">
              <button type="button" className="qb-breadcrumb__link" onClick={goToRoot}>
                Exam
              </button>
              <span className="qb-breadcrumb__sep">/</span>
              <button type="button" className="qb-breadcrumb__link" onClick={goToExam}>
                {examTagLabel(examTag, selectedExam?.display_name)}
              </button>
              <span className="qb-breadcrumb__sep">/</span>
              <button type="button" className="qb-breadcrumb__link" onClick={goToSubject}>
                {subjectFolderLabel(subjectFolder, selectedSubject?.display_name)}
              </button>
              <span className="qb-breadcrumb__sep">/</span>
              <span className="qb-breadcrumb__current">{topicFolder}</span>
            </nav>
            <div className="admin-filter-grid" style={{ marginTop: "0.85rem", marginBottom: "0.75rem" }}>
              <div>
                <label className="label">Search</label>
                <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Question text, explanation, or tag" />
              </div>
              <div>
                <label className="label">Difficulty</label>
                <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}>
                  <option value="">Any</option>
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                  <option value="EXPERT">EXPERT</option>
                </select>
              </div>
              <div>
                <label className="label">Question type</label>
                <select className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value as QuestionType | "")}>
                  <option value="">Any</option>
                  <option value="mcq_single">MCQ</option>
                  <option value="true_false">True / false</option>
                  <option value="tita">TITA</option>
                </select>
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => { if (page !== 1) setPage(1); else void loadWithPage(1); }}>
              Apply filters
            </button>
          </AdminFilterShell>
        ) : (
          <AdminFilterShell>
            <nav className="qb-breadcrumb" aria-label="Question bank location">
              <button type="button" className="qb-breadcrumb__link" onClick={goToRoot}>
                Exam
              </button>
              {examTag ? (
                <>
                  <span className="qb-breadcrumb__sep">/</span>
                  {atSubjectLevel ? (
                    <span className="qb-breadcrumb__current">{examTagLabel(examTag, selectedExam?.display_name)}</span>
                  ) : (
                    <button type="button" className="qb-breadcrumb__link" onClick={goToExam}>
                      {examTagLabel(examTag, selectedExam?.display_name)}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="qb-breadcrumb__sep">/</span>
                  <span className="qb-breadcrumb__current">All categories</span>
                </>
              )}
              {subjectFolder ? (
                <>
                  <span className="qb-breadcrumb__sep">/</span>
                  {atTopicLevel ? (
                    <span className="qb-breadcrumb__current">
                      {subjectFolderLabel(subjectFolder, selectedSubject?.display_name)}
                    </span>
                  ) : (
                    <button type="button" className="qb-breadcrumb__link" onClick={goToSubject}>
                      {subjectFolderLabel(subjectFolder, selectedSubject?.display_name)}
                    </button>
                  )}
                </>
              ) : null}
            </nav>
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.9rem", color: "var(--muted)" }}>
              {foldersLoading
                ? "Loading folder stats…"
                : atExamLevel
                  ? `${(folderTree?.grand_total ?? 0).toLocaleString()} questions across ${examFolders.length} exam categor${examFolders.length === 1 ? "y" : "ies"}. Hover a folder for difficulty mix.`
                  : atSubjectLevel
                    ? "Open a subject folder, then choose a topic to browse questions."
                    : atTopicLevel
                      ? "Open a topic folder to view and manage questions."
                      : ""}
            </p>
          </AdminFilterShell>
        )
      }
    >
      {!inQuestionList ? (
        foldersLoading ? (
          <div className="empty">Loading folders…</div>
        ) : (
          <>
            {selectedFolderIds.length > 0 ? (
              <div className="qb-transfer-bar">
                <span style={{ fontSize: "0.9rem" }}>{selectedFolderIds.length} folder(s) selected</span>
                <button type="button" className="btn btn-ghost" onClick={() => openBulkTransferFolders("move")}>
                  Move…
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => openBulkTransferFolders("copy")}>
                  Copy…
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedFolderIds([])}>
                  Clear
                </button>
              </div>
            ) : null}
            {atSubjectLevel ? (
              <>
                <QuestionBankFolderGrid
                  folders={subjectFolders}
                  onOpen={openSubject}
                  onMove={openMoveSubject}
                  onCopy={openCopySubject}
                  onRename={openRenameSubject}
                  onDelete={openDeleteSubject}
                  selectedIds={selectedFolderIds}
                  onToggleSelect={toggleFolderSelection}
                />
                {!foldersLoading && subjectFolders.length === 0 ? (
                  <p className="empty" style={{ marginTop: "0.75rem" }}>
                    No subject folders yet. Click <strong>Add subject folder</strong> to create one.
                  </p>
                ) : null}
              </>
            ) : atTopicLevel ? (
              <>
                <QuestionBankFolderGrid
                  folders={topicFolders}
                  onOpen={openTopic}
                  onMove={openMoveTopic}
                  onCopy={openCopyTopic}
                  onDelete={openDeleteTopic}
                  selectedIds={selectedFolderIds}
                  onToggleSelect={toggleFolderSelection}
                />
                {!foldersLoading && topicFolders.length === 0 ? (
                  <p className="empty" style={{ marginTop: "0.75rem" }}>
                    No topics yet under this subject. Add questions with this exam, subject, and a topic to create topic folders automatically.
                  </p>
                ) : null}
              </>
            ) : (
              <QuestionBankFolderGrid
                folders={examFolders}
                onOpen={openExam}
                onMove={openMoveCategory}
                onCopy={openCopyCategory}
                onRename={openRenameCategory}
                onDelete={openDeleteCategory}
                selectedIds={selectedFolderIds}
                onToggleSelect={toggleFolderSelection}
              />
            )}
          </>
        )
      ) : (
        <>
          {selectedQuestionIds.length > 0 ? (
            <div className="qb-transfer-bar">
              <span style={{ fontSize: "0.9rem" }}>{selectedQuestionIds.length} selected</span>
              <button type="button" className="btn btn-ghost" onClick={() => openMoveCopy("move")}>
                Move…
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => openMoveCopy("copy")}>
                Copy…
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setSelectedQuestionIds([])}>
                Clear
              </button>
            </div>
          ) : null}
          <div className="table-wrap">
            {loading ? (
              <div className="empty">Loading…</div>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        aria-label="Select all on page"
                        checked={items.length > 0 && items.every((q) => selectedQuestionIds.includes(q.id))}
                        onChange={toggleSelectAllOnPage}
                      />
                    </th>
                    <th>Text</th>
                    <th>Type</th>
                    <th>Difficulty</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select question ${q.id}`}
                          checked={selectedQuestionIds.includes(q.id)}
                          onChange={() => toggleQuestionSelection(q.id)}
                        />
                      </td>
                      <td style={{ maxWidth: 360 }}>
                        {q.question_text.slice(0, 120)}
                        {q.question_text.length > 120 ? "…" : ""}
                      </td>
                      <td>{q.question_type}</td>
                      <td>
                        <span className="badge">{q.difficulty}</span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Link to={`/admin/questions/${q.id}`} className="btn btn-ghost" style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}>
                          Edit
                        </Link>{" "}
                        <button type="button" className="btn btn-danger" style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }} onClick={() => onDelete(q.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loading && items.length === 0 && <div className="empty">No questions match.</div>}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              {total} total · page {page} of {Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {folderModal && (
        <div className="qb-modal-backdrop" onClick={() => !folderModalBusy && setFolderModal(null)}>
          <div className="qb-modal-card" onClick={(e) => e.stopPropagation()}>
            {folderModal.kind === "create-category" ? (
              <>
                <h3 style={{ marginTop: 0 }}>New exam category</h3>
                <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Create a custom category (e.g. JEE, GATE, Campus placements).</p>
                <label className="label">Category name</label>
                <input className="input" value={folderModalInput} onChange={(e) => setFolderModalInput(e.target.value)} autoFocus />
              </>
            ) : null}
            {folderModal.kind === "create-subject" ? (
              <>
                <h3 style={{ marginTop: 0 }}>New subject folder</h3>
                <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  Under {examTagLabel(examTag, selectedExam?.display_name)}.
                </p>
                <label className="label">Subject name</label>
                <input className="input" value={folderModalInput} onChange={(e) => setFolderModalInput(e.target.value)} autoFocus />
              </>
            ) : null}
            {folderModal.kind === "rename-category" || folderModal.kind === "rename-subject" ? (
              <>
                <h3 style={{ marginTop: 0 }}>Rename {folderModal.kind === "rename-category" ? "category" : "subject folder"}</h3>
                <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  Renaming updates all questions in this {folderModal.kind === "rename-category" ? "category" : "folder"}.
                </p>
                <label className="label">New name</label>
                <input className="input" value={folderModalInput} onChange={(e) => setFolderModalInput(e.target.value)} autoFocus />
              </>
            ) : null}
            {folderModal.kind === "delete-category" || folderModal.kind === "delete-subject" || folderModal.kind === "delete-topic" ? (
              <>
                <h3 style={{ marginTop: 0 }}>
                  Delete{" "}
                  {folderModal.kind === "delete-category"
                    ? "category"
                    : folderModal.kind === "delete-subject"
                      ? "subject folder"
                      : "topic folder"}
                  ?
                </h3>
                <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  <strong>{folderModal.label}</strong>
                  {folderModal.count > 0
                    ? ` contains ${folderModal.count} question(s). Deleting will remove the folder and all questions inside it. Move or copy questions first if you want to keep them.`
                    : " is empty and will be removed."}
                </p>
              </>
            ) : null}
            {folderModal.kind === "transfer-folders" ? (
              <>
                <h3 style={{ marginTop: 0 }}>
                  {folderModal.mode === "move" ? "Move" : "Copy"}{" "}
                  {folderModal.folders.length === 1 ? "folder" : `${folderModal.folders.length} folders`}
                </h3>
                <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  {folderModal.folders.length === 1 ? (
                    <>
                      <strong>{folderModal.folders[0].label}</strong>
                      {folderModal.folders[0].count > 0
                        ? ` (${folderModal.folders[0].count} question${folderModal.folders[0].count === 1 ? "" : "s"})`
                        : ""}
                    </>
                  ) : (
                    <>{folderModal.folders.map((f) => f.label).join(", ")}</>
                  )}
                  {folderModal.level === "exam"
                    ? " — subjects and topics keep their names in the destination exam."
                    : " — the original subject and topic names are kept. Only the destination exam tag is added."}
                </p>
                <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>
                  {folderModal.mode === "copy"
                    ? "Copy adds the destination exam tag to each question. Subject and topic stay the same."
                    : "Move adds the destination exam tag and removes the source exam tag. Subject and topic stay the same."}
                </p>

                <p style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.35rem" }}>Destination exam category</p>
                <select
                  className="input"
                  value={transferExam}
                  onChange={(e) => setTransferExam(e.target.value)}
                >
                  <option value="">Select exam category</option>
                  {(folderTree?.exams ?? [])
                    .filter((exam) => {
                      if (
                        folderModal.folders.length === 1 &&
                        folderModal.level === "exam" &&
                        exam.exam_tag === folderModal.folders[0].key
                      ) {
                        return false;
                      }
                      if (folderModal.mode === "copy" && exam.exam_tag === "OTHERS") {
                        return false;
                      }
                      return true;
                    })
                    .map((exam) => (
                      <option key={exam.exam_tag} value={exam.exam_tag}>
                        {examTagLabel(exam.exam_tag, exam.display_name)}
                      </option>
                    ))}
                </select>
                <label className="label" style={{ marginTop: "0.5rem" }}>
                  Or type a new exam category name
                </label>
                <input
                  className="input"
                  value={transferExam}
                  onChange={(e) => setTransferExam(e.target.value)}
                  placeholder="e.g. GATE, Campus placements"
                />
              </>
            ) : null}
            {folderModal.kind === "move-copy" ? (
              <>
                <h3 style={{ marginTop: 0 }}>{folderModal.mode === "move" ? "Move" : "Copy"} questions</h3>
                <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
                  {selectedQuestionIds.length} question(s) → destination folder
                </p>
                <label className="label">Exam category</label>
                <select
                  className="input"
                  value={transferExam}
                  onChange={(e) => {
                    setTransferExam(e.target.value);
                    setTransferSubject("");
                  }}
                >
                  <option value="">Select category</option>
                  {(folderTree?.exams ?? []).map((exam) => (
                    <option key={exam.exam_tag} value={exam.exam_tag}>
                      {examTagLabel(exam.exam_tag, exam.display_name)}
                    </option>
                  ))}
                </select>
                <label className="label" style={{ marginTop: "0.75rem" }}>
                  Subject folder
                </label>
                <select className="input" value={transferSubject} onChange={(e) => setTransferSubject(e.target.value)}>
                  <option value="">Select subject</option>
                  {transferSubjectOptions.map((subj) => (
                    <option key={subj} value={subj}>
                      {subj}
                    </option>
                  ))}
                </select>
                <label className="label" style={{ marginTop: "0.75rem" }}>
                  Or type a new subject name
                </label>
                <input className="input" value={transferSubject} onChange={(e) => setTransferSubject(e.target.value)} placeholder="e.g. Quantitative Aptitude" />
              </>
            ) : null}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
              {folderModal.kind === "delete-category" ||
              folderModal.kind === "delete-subject" ||
              folderModal.kind === "delete-topic" ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={folderModalBusy}
                  onClick={() => void submitFolderModal()}
                >
                  {folderModal.count > 0 ? `Delete folder & ${folderModal.count} question(s)` : "Delete"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={folderModalBusy || transferBusy}
                  onClick={() => void submitFolderModal()}
                >
                  {folderModalBusy || transferBusy
                    ? "Working…"
                    : folderModal.kind === "transfer-folders"
                      ? folderModal.mode === "move"
                        ? "Move"
                        : "Copy"
                      : folderModal.kind === "move-copy"
                        ? folderModal.mode === "move"
                          ? "Move"
                          : "Copy"
                        : "Save"}
                </button>
              )}
              <button type="button" className="btn btn-ghost" disabled={folderModalBusy} onClick={() => setFolderModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAiModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: "1rem",
          }}
          onClick={() => setShowAiModal(false)}
        >
          <div
            className="card"
            style={{ width: "min(900px, 96vw)", maxHeight: "90vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Generate CAT Question with AI</h3>
            <p style={{ color: "var(--muted)", marginTop: "-0.25rem" }}>
              Provide an instruction prompt. You will review and approve before saving.
            </p>
            <label className="label">Prompt</label>
            <textarea
              className="input"
              rows={5}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Example: Create an EXPERT CAT quant question on algebra with tricky distractors and clear explanation."
            />
            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" onClick={onGenerateAiDraft} disabled={aiGenerating}>
                {aiGenerating ? "Generating…" : "Generate draft"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowAiModal(false);
                  setAiDraft(null);
                }}
              >
                Close
              </button>
            </div>

            {aiDraft && (
              <div style={{ marginTop: "1.25rem" }}>
                <h4 style={{ marginBottom: "0.5rem" }}>Generated Draft (Review)</h4>
                <div className="card" style={{ background: "#f8fafc" }}>
                  <div style={{ marginBottom: "0.6rem" }}>
                    <strong>Question:</strong>
                    <div>{aiDraft.question_text}</div>
                  </div>
                  <div style={{ marginBottom: "0.6rem" }}>
                    <strong>Difficulty:</strong> <span className="badge">{aiDraft.difficulty}</span>
                    {"  "}
                    <strong>Subject:</strong> {aiDraft.subject}
                    {"  "}
                    <strong>Topic:</strong> {aiDraft.topic}
                  </div>
                  <div style={{ marginBottom: "0.6rem" }}>
                    <strong>Options:</strong>
                    <ul style={{ marginTop: "0.35rem" }}>
                      {aiDraft.options.map((o) => (
                        <li key={o.key}>
                          {o.key}: {o.label}
                        </li>
                      ))}
                    </ul>
                    <div>
                      <strong>Correct:</strong> {aiDraft.correct_answer}
                    </div>
                  </div>
                  {aiDraft.explanation && (
                    <div style={{ marginBottom: "0.6rem" }}>
                      <strong>Explanation:</strong> {aiDraft.explanation}
                    </div>
                  )}
                  <div>
                    <strong>Tags:</strong> {aiDraft.tags.join(", ")}
                  </div>
                </div>
                <div style={{ marginTop: "0.9rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-primary" onClick={onApproveAiDraft} disabled={aiApproving}>
                    {aiApproving ? "Adding…" : "Approve & Add"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setAiDraft(null)}>
                    Discard draft
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminPanel>
  );
}
