import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CohortPercentileBanner } from "./CohortPercentileBanner";
import { ChallengeGuestEmailGate } from "./ChallengeGuestEmailGate";
import { ChallengeRecapAnalytics } from "./ChallengeRecapAnalytics";
import { getChallengeRecap } from "../api/client";
import type { ChallengeRecapResponse } from "../api/types";
import { isGuestEmailRequiredError } from "../lib/guestEmailGate";
import { getOrCreateGuestId } from "../lib/guestSession";

type PanelPhase = "loading" | "email" | "ready" | "error";

function AccountCreatedModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="radar-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-created-heading"
      onClick={onClose}
    >
      <div
        className="card radar-modal-panel"
        style={{ maxWidth: 400, textAlign: "center", padding: "1.5rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="account-created-heading" style={{ marginTop: 0, fontSize: "1.35rem" }}>
          Account Created!
        </h2>
        <p style={{ color: "var(--muted)", margin: "0 0 1.25rem", lineHeight: 1.55 }}>
          Analytics will be saved.
        </p>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}

export function ChallengeResultPanel({ challengeAttemptId }: { challengeAttemptId: string }) {
  const [recap, setRecap] = useState<ChallengeRecapResponse | null>(null);
  const [phase, setPhase] = useState<PanelPhase>("loading");
  const [showAccountCreatedModal, setShowAccountCreatedModal] = useState(false);

  const loadRecap = useCallback(async () => {
    if (!challengeAttemptId?.trim()) {
      setPhase("error");
      return;
    }
    setPhase("loading");
    getOrCreateGuestId();
    try {
      const data = await getChallengeRecap(challengeAttemptId);
      setRecap(data);
      setPhase("ready");
    } catch (err: unknown) {
      if (isGuestEmailRequiredError(err)) {
        setRecap(null);
        setPhase("email");
        return;
      }
      setRecap(null);
      setPhase("error");
    }
  }, [challengeAttemptId]);

  useEffect(() => {
    void loadRecap();
  }, [loadRecap]);

  if (phase === "email") {
    return (
      <ChallengeGuestEmailGate
        challengeAttemptId={challengeAttemptId}
        onUnlocked={({ accountCreated }) => {
          if (accountCreated) setShowAccountCreatedModal(true);
          void loadRecap();
        }}
      />
    );
  }

  if (phase === "loading") {
    return <p style={{ color: "var(--muted)", textAlign: "center" }}>Loading your challenge results…</p>;
  }

  if (phase === "error" || !recap) {
    return (
      <p style={{ color: "var(--muted)", textAlign: "center" }}>
        Could not load challenge results.{" "}
        <Link to="/">Back to challenges</Link>
      </p>
    );
  }

  const { paper_summary: paper } = recap;

  return (
    <>
      {showAccountCreatedModal ? <AccountCreatedModal onClose={() => setShowAccountCreatedModal(false)} /> : null}

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
                  {s.correct} correct · {s.wrong} wrong
                  {(s.not_attempted ?? 0) > 0 ? ` · ${s.not_attempted} not attempted` : ""} · {s.total_questions} questions
                </div>
              </div>
              <div style={{ fontWeight: 700 }}>{s.marks.toFixed(2)} marks</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
