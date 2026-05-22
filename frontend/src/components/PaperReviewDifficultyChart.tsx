import { useMemo } from "react";
import type { StudentDifficultyLevelStat, StudentPaperDetail, StudentQuestionReview } from "../api/types";

const LEVELS = ["EASY", "MEDIUM", "HARD", "EXPERT"] as const;
type Level = (typeof LEVELS)[number];

interface DifficultyStat {
  level: Level;
  total: number;
  correct: number;
  correctRate: number | null;
  avgTime: number | null;
}

function statsFromServer(stats: StudentDifficultyLevelStat[]): DifficultyStat[] {
  const byLevel = new Map(stats.map((s) => [s.level.toUpperCase(), s]));
  return LEVELS.map((level) => {
    const s = byLevel.get(level);
    return {
      level,
      total: s?.total ?? 0,
      correct: s?.correct ?? 0,
      correctRate: s?.correct_rate ?? null,
      avgTime: s?.avg_time_seconds ?? null,
    };
  });
}

function aggregateByDifficulty(questions: StudentQuestionReview[]): DifficultyStat[] {
  const buckets: Record<Level, { total: number; correct: number; times: number[] }> = {
    EASY: { total: 0, correct: 0, times: [] },
    MEDIUM: { total: 0, correct: 0, times: [] },
    HARD: { total: 0, correct: 0, times: [] },
    EXPERT: { total: 0, correct: 0, times: [] },
  };

  for (const q of questions) {
    const raw = (q.difficulty_when_served || "").toUpperCase();
    if (!LEVELS.includes(raw as Level)) continue;
    const d = raw as Level;
    buckets[d].total += 1;
    if (q.is_correct) buckets[d].correct += 1;
    if (q.time_spent_seconds != null && q.time_spent_seconds >= 0) {
      buckets[d].times.push(q.time_spent_seconds);
    }
  }

  return LEVELS.map((level) => {
    const b = buckets[level];
    const avgTime = b.times.length ? b.times.reduce((x, y) => x + y, 0) / b.times.length : null;
    const correctRate = b.total > 0 ? (b.correct / b.total) * 100 : null;
    return { level, total: b.total, correct: b.correct, correctRate, avgTime };
  });
}

const BAR_MAX_PX = 132;

export function PaperReviewDifficultyChart({ paper }: { paper: StudentPaperDetail }) {
  const stats = useMemo(() => {
    if (paper.difficulty_stats?.length) {
      return statsFromServer(paper.difficulty_stats);
    }
    const allQuestions = paper.sections.flatMap((s) => s.questions);
    return aggregateByDifficulty(allQuestions);
  }, [paper]);
  const hasDifficultyData = stats.some((s) => s.total > 0);
  const maxAvgTime = useMemo(() => {
    const avgs = stats.map((s) => s.avgTime).filter((t): t is number => t != null && t > 0);
    return avgs.length ? Math.max(...avgs) : 0;
  }, [stats]);

  if (!hasDifficultyData) {
    return (
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0, marginBottom: "0.5rem" }}>Performance by difficulty</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.95rem" }}>
          No difficulty labels are stored for these answers (older attempts may be missing this data).
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.05rem", marginTop: 0, marginBottom: "0.35rem" }}>Performance by difficulty</h2>
      <p style={{ margin: "0 0 1rem", color: "var(--muted)", fontSize: "0.9rem" }}>
        Green bars: correct rate. Blue bars: average time on question (tallest = longest average among these four).
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.35rem",
          alignItems: "flex-end",
          minHeight: BAR_MAX_PX + 72,
          padding: "0 0.25rem",
        }}
      >
        {stats.map((s) => {
          const correctPx =
            s.correctRate != null && s.total > 0 ? Math.max(4, (s.correctRate / 100) * BAR_MAX_PX) : 4;
          const timePx =
            s.avgTime != null && maxAvgTime > 0 ? Math.max(4, (s.avgTime / maxAvgTime) * BAR_MAX_PX) : 4;
          const empty = s.total === 0;

          return (
            <div key={s.level} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
              <div
                style={{
                  height: BAR_MAX_PX,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  gap: 5,
                  marginBottom: 6,
                }}
              >
                <div
                  title={
                    empty
                      ? "No questions at this level"
                      : `${Math.round(s.correctRate ?? 0)}% correct (${s.correct}/${s.total})`
                  }
                  style={{
                    width: "46%",
                    height: empty ? 6 : correctPx,
                    background: empty
                      ? "#e2e8f0"
                      : "linear-gradient(180deg, rgba(34,197,94,0.95), rgba(22,163,74,0.92))",
                    borderRadius: "7px 7px 3px 3px",
                    transition: "height 0.25s ease",
                  }}
                />
                <div
                  title={
                    empty || s.avgTime == null
                      ? "No timing data for this level"
                      : `Average ${Math.round(s.avgTime)}s per question`
                  }
                  style={{
                    width: "46%",
                    height: empty || s.avgTime == null ? 6 : timePx,
                    background:
                      empty || s.avgTime == null
                        ? "#e2e8f0"
                        : "linear-gradient(180deg, rgba(56,189,248,0.95), rgba(14,165,233,0.92))",
                    borderRadius: "7px 7px 3px 3px",
                    transition: "height 0.25s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.05em", color: "#475569" }}>{s.level}</div>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#166534", marginTop: 2 }}>
                {empty ? "—" : `${Math.round(s.correctRate ?? 0)}%`}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#0369a1" }}>
                {empty || s.avgTime == null ? "—" : `${Math.round(s.avgTime)}s avg`}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "1.25rem", marginTop: "1rem", fontSize: "0.8rem", color: "var(--muted)", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "linear-gradient(180deg, #22c55e, #16a34a)" }} />
          Correct rate
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "linear-gradient(180deg, #38bdf8, #0ea5e9)" }} />
          Avg. time
        </span>
      </div>
    </div>
  );
}
