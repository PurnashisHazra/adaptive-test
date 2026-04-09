from collections import defaultdict
from typing import Any, Dict, List

from app.repositories.attempt_repository import AttemptRepository
from app.repositories.question_repository import QuestionRepository
from app.schemas.analytics import (
    AnalyticsOverview,
    AttemptBreakdown,
    AttemptListBrief,
    AttemptQuestionStep,
    DifficultyAccuracy,
    MissedQuestionStat,
    TopicPerformance,
    TopPerformer,
)


class AnalyticsService:
    _BREAKDOWN_LIMIT = 100

    def __init__(self) -> None:
        self._attempts = AttemptRepository()
        self._questions = QuestionRepository()

    async def overview(self) -> AnalyticsOverview:
        total_questions = await self._questions.count()

        attempts = await self._attempts.find_all()
        completed = [a for a in attempts if a.get("status") == "completed"]
        total_attempts = len(attempts)
        completed_attempts = len(completed)

        scores = [int(a.get("score", 0)) for a in completed]
        totals = [int(a.get("total_questions", 1)) for a in completed]
        avg_score = sum(scores) / len(scores) if scores else 0.0
        avg_pct = (
            sum(s / t for s, t in zip(scores, totals) if t) / len(completed) if completed else 0.0
        )

        diff_correct: Dict[str, int] = defaultdict(int)
        diff_total: Dict[str, int] = defaultdict(int)
        topic_correct: Dict[str, int] = defaultdict(int)
        topic_total: Dict[str, int] = defaultdict(int)
        miss_count: Dict[str, int] = defaultdict(int)

        for att in completed:
            for ans in att.get("answers", []):
                d = ans.get("difficulty_when_served", "EASY")
                diff_total[d] += 1
                if ans.get("is_correct"):
                    diff_correct[d] += 1
                else:
                    qid = ans.get("question_id")
                    if qid:
                        miss_count[qid] += 1

                qdoc = await self._questions.get_by_id(ans.get("question_id", ""))
                if qdoc:
                    top = qdoc.get("topic", "Unknown")
                    topic_total[top] += 1
                    if ans.get("is_correct"):
                        topic_correct[top] += 1

        diff_stats: List[DifficultyAccuracy] = []
        for d in ["EASY", "MEDIUM", "HARD", "EXPERT"]:
            tot = diff_total.get(d, 0)
            cor = diff_correct.get(d, 0)
            acc = (cor / tot) if tot else 0.0
            diff_stats.append(
                DifficultyAccuracy(difficulty=d, correct=cor, total=tot, accuracy=round(acc, 4))
            )

        topic_stats: List[TopicPerformance] = []
        for top, tot in topic_total.items():
            cor = topic_correct.get(top, 0)
            acc = (cor / tot) if tot else 0.0
            topic_stats.append(
                TopicPerformance(topic=top, correct=cor, total=tot, accuracy=round(acc, 4))
            )
        topic_stats.sort(key=lambda x: -x.total)

        missed_sorted = sorted(miss_count.items(), key=lambda x: -x[1])[:15]
        missed_out: List[MissedQuestionStat] = []
        for qid, cnt in missed_sorted:
            qd = await self._questions.get_by_id(qid)
            txt = (qd or {}).get("question_text", "")[:200]
            missed_out.append(MissedQuestionStat(question_id=qid, question_text=txt, miss_count=cnt))

        recent = attempts[:15]
        recent_brief: List[AttemptListBrief] = []
        for a in recent:
            tq = int(a.get("total_questions", 0))
            sc = int(a.get("score", 0))
            pct = (sc / tq * 100.0) if tq else 0.0
            recent_brief.append(
                AttemptListBrief(
                    id=str(a["_id"]),
                    student_name=a.get("student_name", ""),
                    score=sc,
                    total_questions=tq,
                    percentage=round(pct, 2),
                    started_at=a["started_at"],
                    completed_at=a.get("completed_at"),
                )
            )

        top = await self._top_performers(attempts)

        breakdowns = await self._attempt_breakdowns(attempts)

        return AnalyticsOverview(
            total_questions=total_questions,
            total_attempts=total_attempts,
            completed_attempts=completed_attempts,
            average_score=round(avg_score, 4),
            average_percentage=round(avg_pct * 100.0, 2),
            accuracy_by_difficulty=diff_stats,
            accuracy_by_topic=topic_stats[:20],
            most_missed_questions=missed_out,
            recent_attempts=recent_brief,
            top_performers=top,
            attempt_breakdowns=breakdowns,
        )

    async def _attempt_breakdowns(self, attempts: List[Dict[str, Any]]) -> List[AttemptBreakdown]:
        """Most recent attempts with at least one answer; includes per-question sequence."""
        with_answers = [a for a in attempts if a.get("answers")]
        with_answers.sort(key=lambda x: x.get("started_at"), reverse=True)
        out: List[AttemptBreakdown] = []
        for att in with_answers[: self._BREAKDOWN_LIMIT]:
            aid = str(att["_id"])
            answers = list(att.get("answers") or [])
            steps: List[AttemptQuestionStep] = []
            for i, ans in enumerate(answers, start=1):
                qid = str(ans.get("question_id", ""))
                qdoc = await self._questions.get_by_id(qid) if qid else None
                qtext = (qdoc or {}).get("question_text", "") or ""
                if len(qtext) > 280:
                    qtext = qtext[:277] + "…"
                if not qtext:
                    qtext = f"(question {qid})"
                steps.append(
                    AttemptQuestionStep(
                        sequence=i,
                        question_id=qid,
                        question_text=qtext,
                        difficulty=str(ans.get("difficulty_when_served", "EASY")),
                        time_spent_seconds=ans.get("time_spent_seconds"),
                        is_correct=bool(ans.get("is_correct")),
                    )
                )
            tq = int(att.get("total_questions", 1))
            sc = int(att.get("score", 0))
            pct = (sc / tq * 100.0) if tq else 0.0
            out.append(
                AttemptBreakdown(
                    attempt_id=aid,
                    student_name=att.get("student_name", ""),
                    status=str(att.get("status", "")),
                    score=sc,
                    total_questions=tq,
                    percentage=round(pct, 2),
                    started_at=att["started_at"],
                    completed_at=att.get("completed_at"),
                    steps=steps,
                )
            )
        return out

    async def _top_performers(self, attempts: List[Dict[str, Any]]) -> List[TopPerformer]:
        by_student: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for a in attempts:
            if a.get("status") != "completed":
                continue
            by_student[a.get("student_name", "")].append(a)

        rows: List[TopPerformer] = []
        for name, arr in by_student.items():
            if not name:
                continue
            scores = [int(x.get("score", 0)) for x in arr]
            totals = [int(x.get("total_questions", 1)) for x in arr]
            pcts = [s / t for s, t in zip(scores, totals) if t]
            rows.append(
                TopPerformer(
                    student_name=name,
                    attempts=len(arr),
                    average_score=sum(scores) / len(scores) if scores else 0.0,
                    best_percentage=round(max(pcts) * 100.0, 2) if pcts else 0.0,
                )
            )
        rows.sort(key=lambda x: (-x.best_percentage, -x.average_score))
        return rows[:10]
