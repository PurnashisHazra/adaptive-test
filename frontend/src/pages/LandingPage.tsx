import { Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import "../styles/landing.css";

function BoltIcon() {
  return (
    <svg className="landing-brand-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <polygon points="12,5 14,12 12,19 10,12" fill="currentColor" stroke="none" opacity="0.35" />
      <path d="M12 5v14M5 12h14" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MedalIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="9" r="4" />
      <path d="M8.5 14 6 22l6-3 6 3-2.5-8" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function LandingPage() {
  const role = useAuthStore((s) => s.role);
  const signedIn = role === "student";

  const startHref = signedIn ? "/challenges" : "/auth";
  const startLabel = signedIn ? "Go to Challenges" : "Start Free Test";

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand">
            AdapTest
            <BoltIcon />
          </Link>

          <nav className="landing-nav" aria-label="Main">
            <Link to="/" className="landing-nav-link">
              Home
            </Link>
            <Link to="/challenges" className="landing-nav-link">
              Exams
            </Link>
            <a href="#mentorship" className="landing-nav-link">
              Mentorship
            </a>
            <a href="#how-it-works" className="landing-nav-link">
              How it Works
            </a>
            {signedIn ? (
              <Link to="/history" className="landing-nav-link">
                My results
              </Link>
            ) : (
              <Link to="/auth" className="landing-nav-link">
                Sign In
              </Link>
            )}
          </nav>

          <div className="landing-header-actions">
            <span className="landing-live-badge">
              <span className="landing-live-dot" aria-hidden />
              Live Tests
            </span>
            <Link to={startHref} className="landing-btn-primary">
              {startLabel}
            </Link>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div>
            <span className="landing-kicker">ADAPTIVE INTELLIGENCE • SMARTER PRACTICE</span>
            <h1 className="landing-headline">
              Practice
              <span className="landing-headline-outline">Smarter.</span>
              Score Higher.
            </h1>
            <p className="landing-subhead">
              AdapTest adapts every question to your level — so you stop wasting time and start improving where it
              matters most.
            </p>
            <div className="landing-cta-row">
              <Link to={startHref} className="landing-btn-primary">
                Pick Your Exam
                <ArrowIcon />
              </Link>
              <a href="#how-it-works" className="landing-btn-secondary">
                See How It Works
              </a>
            </div>

            <div className="landing-stats">
              <div className="landing-stat">
                <span className="landing-stat-value">50,000+</span>
                <span className="landing-stat-label">STUDENTS</span>
              </div>
              <div className="landing-stat">
                <span className="landing-stat-value">1M+</span>
                <span className="landing-stat-label">QUESTIONS ATTEMPTED</span>
              </div>
              <div className="landing-stat">
                <span className="landing-stat-value">6</span>
                <span className="landing-stat-label">EXAMS COVERED</span>
              </div>
            </div>
          </div>

          <div className="landing-cards">
            <article className="landing-card landing-card--light" id="mentorship">
              <span className="landing-card-badge landing-card-badge--light">CAREER STRATEGY</span>
              <div className="landing-card-body">
                <div className="landing-card-icon landing-card-icon--light">
                  <CompassIcon />
                </div>
                <div>
                  <h2 className="landing-card-title">Unsure about CAT, SSC, or Banking?</h2>
                  <p className="landing-card-text">
                    Pick the right path with a personalized 1-on-1 counseling session.
                  </p>
                  <a href="https://adaptest.in" className="landing-card-link" target="_blank" rel="noopener noreferrer">
                    Find My Path &gt;
                  </a>
                </div>
              </div>
            </article>

            <article className="landing-card landing-card--dark">
              <span className="landing-card-badge landing-card-badge--dark">ELITE MENTORSHIP</span>
              <div className="landing-card-body">
                <div className="landing-card-icon landing-card-icon--dark">
                  <MedalIcon />
                </div>
                <div>
                  <h2 className="landing-card-title">Learn from the Toppers</h2>
                  <p className="landing-card-text">
                    Book sessions with CAT 99.99%ilers, IIM Alumni &amp; SSC Toppers.
                  </p>
                  <a href="https://adaptest.in" className="landing-card-link" target="_blank" rel="noopener noreferrer">
                    Book a Session &gt;
                  </a>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-section landing-how" id="how-it-works">
          <h2 className="landing-how-title">How it works</h2>
          <p className="landing-how-text">
            Take a live challenge or adaptive test. Each answer updates your difficulty level in real time. Review
            analytics, track progress, and focus on the topics that move your score.
          </p>
        </section>
      </main>
    </div>
  );
}
