import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getMyPaperSectionQuestions } from "../api/client";
import type { StudentQuestionReview } from "../api/types";

const PAGE_SIZE = 8;

type QuestionCardProps = { q: StudentQuestionReview };

export function PaperSectionQuestions({
  paperAttemptId,
  sectionAttemptId,
  questionCount,
  QuestionCard,
}: {
  paperAttemptId: string;
  sectionAttemptId: string;
  questionCount: number;
  QuestionCard: (props: QuestionCardProps) => JSX.Element;
}) {
  const [questions, setQuestions] = useState<StudentQuestionReview[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      const res = await getMyPaperSectionQuestions(paperAttemptId, sectionAttemptId, nextPage, PAGE_SIZE);
      setQuestions((prev) => (append ? [...prev, ...res.questions] : res.questions));
      setPage(res.page);
      setTotalPages(res.total_pages);
    },
    [paperAttemptId, sectionAttemptId],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setQuestions([]);
    setPage(0);
    loadPage(1, false)
      .catch(() => {
        if (alive) toast.error("Could not load questions for this section");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loadPage]);

  const hasMore = page < totalPages;
  const remaining = Math.max(0, questionCount - questions.length);

  async function onLoadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(page + 1, true);
    } catch {
      toast.error("Could not load more questions");
    } finally {
      setLoadingMore(false);
    }
  }

  if (questionCount === 0) {
    return <p className="empty">No questions recorded for this section.</p>;
  }

  if (loading && questions.length === 0) {
    return <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Loading questions…</p>;
  }

  return (
    <>
      {questions.map((q) => (
        <QuestionCard key={`${sectionAttemptId}-${q.question_id}-${q.index}`} q={q} />
      ))}
      {hasMore ? (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: "0.5rem" }}
          disabled={loadingMore}
          onClick={() => void onLoadMore()}
        >
          {loadingMore
            ? "Loading…"
            : `Load more questions${remaining > 0 ? ` (${remaining} remaining)` : ""}`}
        </button>
      ) : null}
    </>
  );
}
