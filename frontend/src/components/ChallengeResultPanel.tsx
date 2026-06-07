import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CohortPercentileBanner } from "./CohortPercentileBanner";
import { ChallengeGuestSignup } from "./ChallengeGuestSignup";
import { ChallengeRecapAnalytics } from "./ChallengeRecapAnalytics";
import { getChallengeRecap } from "../api/client";
import type { ChallengeRecapResponse } from "../api/types";
import { getGuestId, getOrCreateGuestId } from "../lib/guestSession";
import { useAuthStore } from "../store/authStore";

export function ChallengeResultPanel({ challengeAttemptId }: { challengeAttemptId: string }) {
  const role = useAuthStore((s) => s.role);
  const [recap, setRecap] = useState<ChallengeRecapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const showSignup = role !== "student" && Boolean(getGuestId());

  useEffect(() => {
    if (!challengeAttemptId?.trim()) {
      setError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    getOrCreateGuestId();
    getChallengeRecap(challengeAttemptId)
      .then(setRecap)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [challengeAttemptId]);

  if (loading) {
    return <p style={{ color: "var(--muted)", textAlign: "center" }}>Loading your challenge analytics…</p>;
  }

  if (error || !recap) {
    return (
      <p style={{ color: "var(--muted)", textAlign: "center" }}>
        Could not load challenge analytics.{" "}
        <Link to="/">Back to challenges</Link>
      </p>
    );
  }

  const { paper_summary: paper } = recap;

  return (
    <>
      <div className="card" style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>{paper.title}</h1>
        <p style={{ color: "var(--muted)" }}>{paper.student_name}</p>
        <p style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--primary-dark)", margin: "1rem 0 0.5rem" }}>
          {paper.percentage.toFixed(1)}%
        </p>
        <p style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
          Total marks: {paper.total_marks.toFixed(2)} / {paper.max_marks.toFixed(2)}
        </p>
        {paper.ended_early ? (
          <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>Challenge ended before all sections were completed.</p>
        ) : null}
        <CohortPercentileBanner data={paper} label="Percentile among all attempters" />
      </div>

      <ChallengeRecapAnalytics recap={recap} />

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>Sections</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {paper.sections.map((s, i) => (
            <div
              key={i}
              style={{
                padding: "0.75rem",
                borderRadius: 10,
                border: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{s.section_title}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  {s.correct} correct · {s.wrong} wrong · {s.total_questions} questions
                </div>
              </div>
              <div style={{ fontWeight: 700 }}>{s.marks.toFixed(2)} marks</div>
            </div>
          ))}
        </div>
      </div>

      {showSignup ? <ChallengeGuestSignup /> : null}
    </>
  );
}
