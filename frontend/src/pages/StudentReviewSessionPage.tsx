import { useEffect, useState, type CSSProperties } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { formatDateTimeIST } from "../lib/istTime";
import { CohortPercentileBanner } from "../components/CohortPercentileBanner";
import { PaperReviewDifficultyChart } from "../components/PaperReviewDifficultyChart";
import { PaperSectionQuestions } from "../components/PaperSectionQuestions";
import { StudentPerformanceSpiderChart } from "../components/StudentPerformanceSpiderChart";
import { getMyPaperReview, getMyStandaloneReview } from "../api/client";
import type {
  StudentInsightCapsule,
  StudentInsightCapsuleKey,
  StudentPaperDetail,
  StudentPerformanceInsights,
  StudentQuestionReview,
  StudentStandaloneDetail,
} from "../api/types";
import { AppPage } from "../components/AppPage";

function peerAccuracyLine(q: StudentQuestionReview): { main: string; note?: string } {
  const n = q.peer_answer_count ?? 0;
  const pct = q.peer_accuracy_percent;
  if (n > 0 && pct != null && !Number.isNaN(pct)) {
    return { main: `${pct.toFixed(1)}%`, note: `Across ${n} answer${n === 1 ? "" : "s"} on this question (all students).` };
  }
  return { main: "—", note: "No other attempts recorded for this question in the bank yet." };
}

function peerAvgTimeLine(q: StudentQuestionReview): { main: string; note?: string } {
  const n = q.peer_time_peer_sample_count ?? 0;
  const avg = q.peer_avg_time_seconds;
  if (n > 0 && avg != null && !Number.isNaN(avg)) {
    return { main: `${avg.toFixed(1)}s`, note: `Average over ${n} timed answer${n === 1 ? "" : "s"} from other attempts.` };
  }
  return { main: "—", note: "Peers have not logged enough times for this question." };
}

function speedRankLine(q: StudentQuestionReview): { main: string; note?: string } {
  const nPeer = q.peer_time_peer_sample_count ?? 0;
  const y = q.your_time_faster_than_peer_percent;
  const t = q.time_spent_seconds;
  if (t == null) {
    return { main: "—", note: "No time was stored for your attempt on this question." };
  }
  if (nPeer > 0 && y != null && !Number.isNaN(y)) {
    return {
      main: `Faster than ${y.toFixed(0)}% of peers`,
      note: `Compared to ${nPeer} other timed attempt${nPeer === 1 ? "" : "s"} on this question.`,
    };
  }
  return { main: "—", note: "Need other students’ timings to rank your speed." };
}

function insightCapsuleColors(key: StudentInsightCapsuleKey): { bg: string; color: string; border: string } {
  switch (key) {
    case "missed_opportunity":
      return { bg: "rgba(234,179,8,0.16)", color: "#854d0e", border: "1px solid rgba(234,179,8,0.45)" };
    case "wasted_time":
      return { bg: "rgba(249,115,22,0.14)", color: "#9a3412", border: "1px solid rgba(249,115,22,0.4)" };
    case "skip_revisit":
      return { bg: "rgba(99,102,241,0.14)", color: "#3730a3", border: "1px solid rgba(99,102,241,0.35)" };
    default:
      return { bg: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0" };
  }
}

function QuestionInsightCapsules({ capsules }: { capsules: StudentInsightCapsule[] }) {
  if (!capsules.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.65rem" }} role="list" aria-label="Insight flags for this question">
      {capsules.map((c) => {
        const palette = insightCapsuleColors(c.key);
        return (
          <span
            key={c.key}
            role="listitem"
            title={c.hint || c.label}
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "0.28rem 0.55rem",
              borderRadius: 999,
              ...palette,
            }}
          >
            {c.label}
          </span>
        );
      })}
    </div>
  );
}

export function QuestionReviewCard({ q }: { q: StudentQuestionReview }) {
  const attempted = q.is_attempted !== false;
  const diff = q.difficulty_when_served ? String(q.difficulty_when_served).toUpperCase() : null;
  const acc = peerAccuracyLine(q);
  const avgT = peerAvgTimeLine(q);
  const spd = speedRankLine(q);

  const peerBoxStyle: CSSProperties = {
    marginTop: "1rem",
    padding: "0.85rem 1rem",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    borderLeft: "4px solid #0ea5e9",
    background: "#f8fafc",
    color: "#0f172a",
    fontSize: "0.9rem",
    lineHeight: 1.5,
  };

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <span style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className="badge">Question {q.index}</span>
          {diff ? (
            <span className="badge" style={{ background: "rgba(100,116,139,0.12)", color: "#475569" }}>
              {diff}
            </span>
          ) : null}
        </span>
        <span
          className="badge"
          style={
            !attempted
              ? { background: "rgba(100,116,139,0.14)", color: "#475569" }
              : q.is_correct
                ? { background: "rgba(34,197,94,0.15)", color: "#166534" }
                : { background: "rgba(239,68,68,0.15)", color: "#991b1b" }
          }
        >
          {!attempted ? "Not attempted" : q.is_correct ? "Correct" : "Wrong"}
        </span>
      </div>
      <QuestionInsightCapsules capsules={q.insight_capsules ?? []} />
      <h3 style={{ fontSize: "1.05rem", marginTop: "0.85rem", lineHeight: 1.45, marginBottom: 0 }}>{q.question_text}</h3>
      {q.image_url ? (
        <div style={{ marginTop: "0.65rem" }}>
          <img src={q.image_url} alt="" style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 8, border: "1px solid var(--border)" }} />
        </div>
      ) : null}
      <p style={{ marginTop: "0.65rem", marginBottom: "0.35rem" }}>
        <strong>Your answer:</strong> {q.chosen_label}
        {q.chosen_answer !== q.chosen_label ? (
          <span style={{ color: "var(--muted)", marginLeft: "0.35rem" }}>({q.chosen_answer})</span>
        ) : null}
      </p>
      <p style={{ marginTop: 0, marginBottom: 0 }}>
        <strong>Correct answer:</strong> {q.correct_label || "—"}
      </p>

      <div style={peerBoxStyle}>
        <div style={{ fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.04em", textTransform: "uppercase", color: "#475569", marginBottom: "0.65rem" }}>
          Question-wise peer comparison
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(132px, 38%) 1fr", gap: "0.5rem 0.75rem", margin: 0 }}>
          <dt style={{ margin: 0, fontWeight: 600, color: "#334155" }}>Your time</dt>
          <dd style={{ margin: 0 }}>
            <strong>{q.time_spent_seconds != null ? `${q.time_spent_seconds}s` : "—"}</strong>
          </dd>

          <dt style={{ margin: 0, fontWeight: 600, color: "#334155" }}>Peer accuracy</dt>
          <dd style={{ margin: 0 }}>
            <strong>{acc.main}</strong>
            {acc.note ? <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.2rem" }}>{acc.note}</div> : null}
          </dd>

          <dt style={{ margin: 0, fontWeight: 600, color: "#334155" }}>Peer avg time</dt>
          <dd style={{ margin: 0 }}>
            <strong>{avgT.main}</strong>
            {avgT.note ? <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.2rem" }}>{avgT.note}</div> : null}
          </dd>

          <dt style={{ margin: 0, fontWeight: 600, color: "#334155" }}>Your speed vs peers</dt>
          <dd style={{ margin: 0 }}>
            <strong>{spd.main}</strong>
            {spd.note ? <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "0.2rem" }}>{spd.note}</div> : null}
          </dd>
        </dl>
      </div>

      {q.explanation ? (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.85rem 1rem",
            background: "#f1f5f9",
            borderRadius: 10,
            fontSize: "0.95rem",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ display: "block", marginBottom: "0.35rem" }}>Explanation</strong>
          <span style={{ whiteSpace: "pre-wrap" }}>{q.explanation}</span>
        </div>
      ) : null}
    </div>
  );
}

function PaperCohortBanner({ paper }: { paper: StudentPaperDetail }) {
  return (
    <CohortPercentileBanner
      data={{
        cohort_percentile: paper.cohort_percentile ?? paper.your_score_better_than_percent,
        cohort_ranked_count: paper.cohort_ranked_count ?? paper.cohort_scored_attempt_count,
        percentile_is_final: paper.percentile_is_final,
      }}
      label="Overall percentile on this paper"
    />
  );
}

function StudentInsightsPanel({
  insights,
  questions,
}: {
  insights: StudentPerformanceInsights;
  questions: StudentQuestionReview[];
}) {
  const chip: CSSProperties = {
    display: "inline-block",
    padding: "0.35rem 0.55rem",
    borderRadius: 8,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    fontSize: "0.85rem",
    color: "#334155",
  };
  const card: CSSProperties = {
    marginTop: "1.25rem",
    padding: "1rem 1.1rem",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
  };
  return (
    <section style={card}>
      <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Personalized analysis</h2>
      <p style={{ margin: "0.4rem 0 0.9rem", color: "var(--muted)", fontSize: "0.9rem" }}>
        Based on your attempt behavior, speed and conversion.
      </p>
      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
        <span style={chip}>Accuracy: {insights.accuracy_percent.toFixed(1)}%</span>
        <span style={chip}>Avg time/question: {insights.avg_time_seconds != null ? `${insights.avg_time_seconds}s` : "—"}</span>
        <span style={chip}>Wasted time questions: {insights.wasted_time_questions}</span>
        <span style={chip}>Missed opportunities: {insights.missed_opportunity_questions}</span>
        <span style={chip}>Should skip & revisit: {insights.skip_candidate_questions}</span>
      </div>

      <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.7rem" }}>
        {insights.strong_areas.length > 0 ? (
          <div>
            <strong style={{ color: "#166534" }}>Good at:</strong>{" "}
            {insights.strong_areas
              .map((x) => `${x.name} (${x.accuracy_percent.toFixed(0)}% over ${x.attempts})`)
              .join(", ")}
          </div>
        ) : null}
        {insights.weak_areas.length > 0 ? (
          <div>
            <strong style={{ color: "#991b1b" }}>Needs improvement:</strong>{" "}
            {insights.weak_areas
              .map((x) => `${x.name} (${x.accuracy_percent.toFixed(0)}% over ${x.attempts})`)
              .join(", ")}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <strong>Exam strategy to maximize score:</strong>
        <ul style={{ margin: "0.45rem 0 0", paddingLeft: "1.1rem" }}>
          {insights.recommendations.map((tip, i) => (
            <li key={`${tip.title}-${i}`} style={{ marginBottom: "0.35rem" }}>
              <strong>{tip.title}:</strong> {tip.detail}
            </li>
          ))}
        </ul>
      </div>
      {questions.length > 0 ? <StudentPerformanceSpiderChart insights={insights} questions={questions} /> : null}
    </section>
  );
}

export function StudentReviewSessionPage() {
  const { sessionType, id } = useParams<{ sessionType: string; id: string }>();
  const [standalone, setStandalone] = useState<StudentStandaloneDetail | null>(null);
  const [paper, setPaper] = useState<StudentPaperDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const decodedId = id ? decodeURIComponent(id) : "";

  useEffect(() => {
    if (!sessionType || !decodedId) return;
    let alive = true;
    setLoading(true);
    setStandalone(null);
    setPaper(null);
    const run = async () => {
      try {
        if (sessionType === "standalone") {
          const d = await getMyStandaloneReview(decodedId);
          if (alive) setStandalone(d);
        } else if (sessionType === "paper") {
          const d = await getMyPaperReview(decodedId);
          if (alive) setPaper(d);
        }
      } catch {
        if (alive) {
          toast.error("Could not load this session");
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [sessionType, decodedId]);

  if (!sessionType || !decodedId) {
    return <Navigate to="/review" replace />;
  }

  if (sessionType !== "standalone" && sessionType !== "paper") {
    return <Navigate to="/review" replace />;
  }

  const pageTitle =
    sessionType === "standalone" && standalone
      ? standalone.title
      : sessionType === "paper" && paper
        ? paper.paper_title
        : "Session review";

  return (
    <AppPage title={pageTitle}>
      <p className="app-page-back">
        <Link to="/review">← All sessions</Link>
      </p>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : sessionType === "standalone" && standalone ? (
        <>
          <p className="app-page-lead">
            {standalone.status === "completed" ? (
              <>
                Score {standalone.score}/{standalone.total_questions}
                {standalone.percentage != null ? ` · ${standalone.percentage}%` : ""}
                {standalone.ended_early ? " · Ended early" : ""}
              </>
            ) : (
              <>In progress — showing questions answered so far</>
            )}
          </p>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginTop: "0.35rem" }}>
            Started {formatDateTimeIST(standalone.started_at)}
            {standalone.completed_at ? ` · Finished ${formatDateTimeIST(standalone.completed_at)}` : ""}
          </p>
          <CohortPercentileBanner data={standalone} label="Overall percentile in this practice cohort" />
          <StudentInsightsPanel insights={standalone.insights} questions={standalone.questions} />
          <h2 className="app-page-section__title" style={{ marginTop: "2rem" }}>
            Questions
          </h2>
          {standalone.questions.length === 0 ? (
            <p className="empty">No answers recorded yet.</p>
          ) : (
            standalone.questions.map((q) => <QuestionReviewCard key={`${q.question_id}-${q.index}`} q={q} />)
          )}
        </>
      ) : sessionType === "paper" && paper ? (
        <>
          <p className="app-page-lead">
            {paper.status === "completed" || paper.status === "ended_early" ? (
              <>
                {paper.total_marks != null && paper.max_marks != null ? (
                  <>
                    Marks {paper.total_marks.toFixed(2)} / {paper.max_marks.toFixed(2)}
                    {paper.percentage != null ? ` · ${paper.percentage}%` : ""}
                  </>
                ) : null}
                {paper.ended_early ? " · Ended early" : ""}
              </>
            ) : (
              <>In progress — sections below show completed parts</>
            )}
          </p>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginTop: "0.35rem" }}>
            Started {formatDateTimeIST(paper.started_at)}
            {paper.completed_at ? ` · Finished ${formatDateTimeIST(paper.completed_at)}` : ""}
          </p>
          <StudentInsightsPanel insights={paper.insights} questions={[]} />
          <PaperCohortBanner paper={paper} />
          <PaperReviewDifficultyChart paper={paper} />
          {paper.sections.map((sec) => {
            const qCount = sec.question_count ?? sec.questions.length;
            return (
              <section key={sec.attempt_id} className="app-page-section">
                <h2 className="app-page-section__title">
                  {sec.section_title}{" "}
                  <span style={{ color: "var(--muted)", fontWeight: 500 }}>
                    (section {sec.section_index + 1} · {qCount} question{qCount === 1 ? "" : "s"})
                  </span>
                </h2>
                {sec.questions.length > 0 ? (
                  sec.questions.map((q) => (
                    <QuestionReviewCard key={`${sec.attempt_id}-${q.question_id}-${q.index}`} q={q} />
                  ))
                ) : (
                  <PaperSectionQuestions
                    paperAttemptId={paper.paper_attempt_id}
                    sectionAttemptId={sec.attempt_id}
                    questionCount={qCount}
                    QuestionCard={QuestionReviewCard}
                  />
                )}
              </section>
            );
          })}
          {paper.sections.length === 0 ? <p className="empty">No section data yet.</p> : null}
        </>
      ) : (
        <p style={{ color: "var(--muted)" }}>Session not found or you do not have access.</p>
      )}
    </AppPage>
  );
}
