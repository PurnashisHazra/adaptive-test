import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdaptiveTestPitch } from "./AdaptiveTestPitch";
import type { ChallengeCatalogItem } from "../api/types";

export function ChallengeHeroCta({
  signedIn,
  featured,
  starting,
  onStartFeatured,
}: {
  signedIn: boolean;
  featured: ChallengeCatalogItem | null;
  starting: boolean;
  onStartFeatured: () => void;
}) {
  const [showAdaptiveModal, setShowAdaptiveModal] = useState(false);

  const canStartFeatured =
    featured &&
    !featured.completed &&
    !featured.has_started &&
    featured.open_to_all &&
    (signedIn || featured.open_to_all);

  useEffect(() => {
    if (!showAdaptiveModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAdaptiveModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAdaptiveModal]);

  return (
    <>
      <section className="challenge-hero-cta" aria-labelledby="challenge-hero-heading">
        <div className="challenge-hero-cta__inner">
          <div className="challenge-hero-cta__copy">
            <p className="challenge-hero-cta__crumb">
              Home <span aria-hidden>›</span> Challenges <span aria-hidden>›</span> Free mock test
            </p>
            <h1 id="challenge-hero-heading" className="challenge-hero-cta__title">
              Free CAT, SSC, Banking Mock Tests with adaptive analytics
            </h1>
            <p className="challenge-hero-cta__lead">
              Tests prepared by IIM Alumni, CAT toppers and experts from IMS, EMGC and other top coaching centers.
            </p>
            <div className="challenge-hero-cta__actions">
              {canStartFeatured ? (
                <button
                  type="button"
                  className="btn btn-primary challenge-hero-cta__btn-primary"
                  disabled={starting}
                  onClick={onStartFeatured}
                >
                  {starting ? "Starting…" : "Start free challenge"}
                </button>
              ) : featured?.has_started && !featured.completed ? (
                <a href="#challenges-list" className="btn btn-primary challenge-hero-cta__btn-primary">
                  Continue your challenge
                </a>
              ) : (
                <a href="#challenges-list" className="btn btn-primary challenge-hero-cta__btn-primary">
                  View live challenges
                </a>
              )}
              <a href="#challenges-list" className="btn btn-ghost challenge-hero-cta__btn-secondary">
                Browse all challenges
              </a>
              {!signedIn ? (
                <Link to="/auth" className="btn btn-ghost challenge-hero-cta__btn-secondary">
                  Sign in
                </Link>
              ) : null}
            </div>
          </div>
          <div className="challenge-hero-cta__visual">
            <div className="challenge-hero-cta__orb" aria-hidden />
            <div className="challenge-hero-cta__badges">
              <div className="challenge-hero-cta__badge">
                <strong>Free to start</strong>
                <span>No account needed</span>
              </div>
              <button
                type="button"
                className="challenge-hero-cta__badge challenge-hero-cta__badge--accent challenge-hero-cta__badge--clickable challenge-hero-cta__badge--interactive"
                onClick={() => setShowAdaptiveModal(true)}
                aria-haspopup="dialog"
                aria-label="Adaptive AI — tap to learn how it works"
              >
                <span className="challenge-hero-cta__badge-tag">Tap to explore</span>
                <strong>Adaptive AI</strong>
                <span className="challenge-hero-cta__badge-cta">
                  Questions fit you
                  <span className="challenge-hero-cta__badge-arrow" aria-hidden>
                    →
                  </span>
                </span>
              </button>
              <div className="challenge-hero-cta__badge">
                <strong>Live percentile</strong>
                <span>Rank vs attempters</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showAdaptiveModal ? (
        <div
          className="radar-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adaptive-pitch-heading"
          onClick={() => setShowAdaptiveModal(false)}
        >
          <div
            className="radar-modal-panel challenge-hero-cta__adaptive-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="challenge-hero-cta__adaptive-modal-head">
              <button
                type="button"
                className="btn btn-ghost challenge-hero-cta__adaptive-close"
                onClick={() => setShowAdaptiveModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <AdaptiveTestPitch expanded showCta={false} signedIn={signedIn} className="adaptive-pitch--modal" />
          </div>
        </div>
      ) : null}
    </>
  );
}
