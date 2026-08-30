import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listExamShowcasePapers, getExamNews, getHomepageLeaderboard, getTodaysTopper } from "../api/client";
import type { ExamNewsItem, ExamShowcasePaper, HomepageLeaderboard, TodaysTopper } from "../api/types";
import { ExamNewsCarousel } from "../components/ExamNewsCarousel";
import { LandingLeaderboard } from "../components/LandingLeaderboard";
import { useAuthStore } from "../store/authStore";
import { TopperBookingModal } from "../components/TopperBookingModal";
import { FreeConsultationModal } from "../components/FreeConsultationModal";
import { LeaderConnectModal } from "../components/LeaderConnectModal";
import { PaperUnlockModal } from "../components/PaperUnlockModal";
import { PRIMARY_LEADER_COMPANIES, STACKED_LEADER_COMPANIES } from "../data/leaderCompanies";
import "../styles/landing.css";

type ShowcaseCategoryId = "mba" | "law" | "banking" | "railways" | "defense";

type ExamCategoryId =
  | "cat"
  | "gmat"
  | "gre"
  | "ielts"
  | "clat"
  | "banking"
  | "ssc"
  | "railway"
  | "nda"
  | "upsc"
  | "mpsc"
  | "ugc-net"
  | "ctet"
  | "mh-cet";

type ExamCategory = {
  id: ExamCategoryId;
  label: string;
  title: string;
  description: string;
  exams: string;
  href: string;
  logo: string;
  showcaseId: ShowcaseCategoryId;
};

function CompassIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <polygon points="12,5 14,12 12,19 10,12" fill="currentColor" stroke="none" opacity="0.35" />
      <path d="M12 5v14M5 12h14" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H5a3 3 0 0 0 3 5M17 6h2a3 3 0 0 1-3 5" />
    </svg>
  );
}

function MedalIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="9" r="4" />
      <path d="M8.5 14 6 22l6-3 6 3-2.5-8" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const EXAM_CATEGORIES: ExamCategory[] = [
  {
    id: "cat",
    label: "CAT",
    title: "CAT & MBA entrance",
    description:
      "Adaptive mock tests for CAT and other MBA entrances. Difficulty adjusts after every answer so you drill weak topics and build exam-day speed.",
    exams: "CAT · XAT · SNAP · NMAT",
    href: "/cat-mock-test",
    logo: "/exam-logos/cat.png",
    showcaseId: "mba",
  },
  {
    id: "gmat",
    label: "GMAT",
    title: "GMAT preparation",
    description:
      "Quant and verbal practice that adapts as you improve. Use timed mocks to build the pacing you need for GMAT Focus and classic GMAT.",
    exams: "GMAT Focus · GMAT Classic · Quant · Verbal",
    href: "/cat-mock-test",
    logo: "/exam-logos/gmat.png",
    showcaseId: "mba",
  },
  {
    id: "gre",
    label: "GRE",
    title: "GRE preparation",
    description:
      "Verbal, quant, and analytical practice with adaptive difficulty. Track accuracy and speed so every attempt moves your GRE score.",
    exams: "GRE General · Verbal · Quant",
    href: "/challenges",
    logo: "/exam-logos/gre.png",
    showcaseId: "mba",
  },
  {
    id: "ielts",
    label: "IELTS",
    title: "IELTS coaching",
    description:
      "Build reading and language accuracy with timed practice. Adaptive items help you move from band-building drills to exam-day confidence.",
    exams: "IELTS Academic · IELTS General Training",
    href: "/challenges",
    logo: "/exam-logos/ielts.png",
    showcaseId: "mba",
  },
  {
    id: "clat",
    label: "CLAT",
    title: "Law entrance exams",
    description:
      "Practice CLAT, AILET, and Maharashtra Law CET with timed sections, negative marking, and analytics that show where to improve before the real exam.",
    exams: "CLAT · AILET · MHCET Law · SLAT",
    href: "/challenges",
    logo: "/exam-logos/clat.png",
    showcaseId: "law",
  },
  {
    id: "banking",
    label: "Banking",
    title: "Banking & IBPS exams",
    description:
      "IBPS, SBI, and RRB-style mocks with quant, reasoning, and English. Live challenges and full-length papers keep your prep structured.",
    exams: "IBPS PO · IBPS Clerk · SBI PO · RRB",
    href: "/bank-exam-mock-test",
    logo: "/exam-logos/banking.png",
    showcaseId: "banking",
  },
  {
    id: "ssc",
    label: "SSC",
    title: "SSC CGL, CHSL & GD",
    description:
      "Staff Selection Commission papers with real exam timing. Adaptive difficulty helps you push from qualifying level to a competitive rank.",
    exams: "SSC CGL · CHSL · MTS · GD",
    href: "/ssc-mock-test",
    logo: "/exam-logos/ssc.png",
    showcaseId: "defense",
  },
  {
    id: "railway",
    label: "Railways",
    title: "Railway recruitment exams",
    description:
      "RRB NTPC, Group D, and ALP-style practice with sectional timing. Attempt live mocks and track accuracy trends across attempts.",
    exams: "RRB NTPC · Group D · ALP · JE",
    href: "/ssc-mock-test",
    logo: "/exam-logos/railway.png",
    showcaseId: "railways",
  },
  {
    id: "nda",
    label: "NDA",
    title: "NDA & defense exams",
    description:
      "National Defence Academy and related defense papers. Build maths and GAT accuracy with mocks that get harder as you improve.",
    exams: "NDA · CDS · AFCAT · CAPF",
    href: "/challenges",
    logo: "/exam-logos/nda.png",
    showcaseId: "defense",
  },
  {
    id: "upsc",
    label: "UPSC",
    title: "UPSC Civil Services",
    description:
      "Practice GS and aptitude-style papers for civil services. Timed sections and review help you see which topics still need work.",
    exams: "UPSC CSE · Prelims · CSAT",
    href: "/challenges",
    logo: "/exam-logos/upsc.png",
    showcaseId: "defense",
  },
  {
    id: "mpsc",
    label: "MPSC",
    title: "Maharashtra Public Service Commission",
    description:
      "State civil services practice for MPSC. Use adaptive mocks to strengthen Rajyaseva and combined exam fundamentals.",
    exams: "MPSC Rajyaseva · Combined · PSI / STI / ASO",
    href: "/challenges",
    logo: "/exam-logos/mpsc.png",
    showcaseId: "defense",
  },
  {
    id: "ugc-net",
    label: "UGC NET",
    title: "UGC NET & JRF",
    description:
      "Paper 1 teaching aptitude and reasoning practice for NET/JRF. Adaptive difficulty keeps you in the productive range.",
    exams: "UGC NET · JRF · Paper 1",
    href: "/challenges",
    logo: "/exam-logos/ugc-net.png",
    showcaseId: "mba",
  },
  {
    id: "ctet",
    label: "CTET",
    title: "CTET & teaching exams",
    description:
      "Central Teacher Eligibility Test practice with pedagogy and aptitude items. Timed mocks help you finish Paper I and Paper II with confidence.",
    exams: "CTET Paper I · Paper II · TET",
    href: "/challenges",
    logo: "/exam-logos/ctet.png",
    showcaseId: "mba",
  },
  {
    id: "mh-cet",
    label: "MHT CET",
    title: "MHT CET & Class 11–12 Science",
    description:
      "Maharashtra CET and board-aligned science practice. Adaptive questions help PCM/PCB students lock concepts before the entrance.",
    exams: "MHT CET · Class 11 · Class 12 Science",
    href: "/challenges",
    logo: "/exam-logos/mh-cet.png",
    showcaseId: "mba",
  },
];

export function LandingPage() {
  const role = useAuthStore((s) => s.role);
  const [showBooking, setShowBooking] = useState(false);
  const [showConsultation, setShowConsultation] = useState(false);
  const [leaderConnectCompany, setLeaderConnectCompany] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ExamCategoryId>("cat");
  const [showcasePapers, setShowcasePapers] = useState<ExamShowcasePaper[]>([]);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
  const [unlockPaper, setUnlockPaper] = useState<{ id: string; title: string } | null>(null);
  const [todaysTopper, setTodaysTopper] = useState<TodaysTopper | null>(null);
  const [topperLoading, setTopperLoading] = useState(true);
  const [examNews, setExamNews] = useState<ExamNewsItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<HomepageLeaderboard | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  const category = EXAM_CATEGORIES.find((c) => c.id === activeCategory) ?? EXAM_CATEGORIES[0];

  const loadShowcase = useCallback(async (showcaseId: ShowcaseCategoryId) => {
    setShowcaseLoading(true);
    try {
      setShowcasePapers(await listExamShowcasePapers(showcaseId));
    } catch {
      setShowcasePapers([]);
    } finally {
      setShowcaseLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShowcase(category.showcaseId);
  }, [category.showcaseId, loadShowcase, role]);

  useEffect(() => {
    let alive = true;
    setTopperLoading(true);
    getTodaysTopper()
      .then((row) => {
        if (alive) setTodaysTopper(row);
      })
      .catch(() => {
        if (alive) setTodaysTopper(null);
      })
      .finally(() => {
        if (alive) setTopperLoading(false);
      });
    getExamNews()
      .then((items) => {
        if (alive) setExamNews(items);
      })
      .catch(() => {
        if (alive) setExamNews([]);
      });
    setLeaderboardLoading(true);
    getHomepageLeaderboard()
      .then((board) => {
        if (alive) setLeaderboard(board);
      })
      .catch(() => {
        if (alive) setLeaderboard({ most_challenges: [], highest_scores: [], new_signups: [] });
      })
      .finally(() => {
        if (alive) setLeaderboardLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function onPaperClick(paper: ExamShowcasePaper) {
    if (!paper.locked) return;
    if (!paper.id) {
      toast.error("Could not load this paper. Please refresh the page.");
      return;
    }
    setUnlockPaper({ id: paper.id, title: paper.title });
  }

  return (
    <div className="landing">
      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-spotlight-wrap">
            <Link to="/challenges" className="landing-ribbon">
              <span>Earn special discounts on mock tests by acing Challenges!</span>
              <span className="landing-ribbon-sep" aria-hidden>
                •
              </span>
              <span>Earn coins to buy exam goodies!</span>
            </Link>
            <div className="landing-spotlight">
              <aside className="landing-topper" aria-labelledby="todays-topper-heading">
                <div className="landing-topper-icon" aria-hidden>
                  <TrophyIcon />
                </div>
                <div className="landing-topper-body">
                  <p className="landing-topper-kicker" id="todays-topper-heading">
                    Today&apos;s topper
                  </p>
                  {topperLoading ? (
                    <p className="landing-topper-empty">Loading today&apos;s leader…</p>
                  ) : todaysTopper ? (
                    <p className="landing-topper-line">
                      <Link to={`/u/${encodeURIComponent(todaysTopper.profile_slug)}`} className="landing-topper-name">
                        {todaysTopper.display_name}
                      </Link>
                      <span className="landing-topper-score">
                        {todaysTopper.percentage.toFixed(1)}%
                        <span className="landing-topper-marks">
                          {" "}
                          · {todaysTopper.total_marks.toFixed(0)}/{todaysTopper.max_marks.toFixed(0)}
                        </span>
                      </span>
                      <span className="landing-topper-challenge">{todaysTopper.challenge_title}</span>
                    </p>
                  ) : (
                    <p className="landing-topper-empty">No challenge toppers yet. Take a free mock and claim the spot.</p>
                  )}
                </div>
              </aside>
              <ExamNewsCarousel items={examNews} />
            </div>
          </div>

          <div className="landing-hero-copy">
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
              <Link to="/challenges" className="landing-btn-primary landing-btn-lg landing-btn-mock">
                <span className="landing-btn-mock-title">Free Mock Tests</span>
                <span className="landing-btn-mock-sub">Compete with other brilliant students</span>
              </Link>
              <a href="#exam-categories" className="landing-btn-secondary landing-btn-lg">
                Browse exam categories
              </a>
            </div>
          </div>

          <LandingLeaderboard data={leaderboard} loading={leaderboardLoading} />

          <div className="landing-hero-aside">
            <h2 className="landing-aside-heading">Mentorship &amp; network</h2>
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
                  <button
                    type="button"
                    className="landing-card-btn landing-card-btn--primary"
                    onClick={() => setShowConsultation(true)}
                  >
                    Free Consultation
                    <ArrowIcon />
                  </button>
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
                  <h2 className="landing-card-title">Learn from the Toppers @ ₹100</h2>
                  <p className="landing-card-text">
                    Book 30 minute sessions with CAT 99.99%ilers, IIM Alumni &amp; SSC Toppers.
                  </p>
                  <button
                    type="button"
                    className="landing-card-btn landing-card-btn--on-dark"
                    onClick={() => setShowBooking(true)}
                  >
                    Book a Session
                    <ArrowIcon />
                  </button>
                </div>
              </div>
            </article>
            </div>
          </div>

          <article className="landing-card landing-card--light landing-card--leaders">
            <div className="landing-leaders-row">
              <div className="landing-card-leaders-intro">
                <div className="landing-card-icon landing-card-icon--light">
                  <BriefcaseIcon />
                </div>
                <div className="landing-card-leaders-copy">
                  <span className="landing-card-badge landing-card-badge--light">INDUSTRY INSIGHTS</span>
                  <h2 className="landing-card-title">Connect with current business leaders</h2>
                  <p className="landing-card-text landing-card-text--flush">
                    Ex-students now at Apple, NVIDIA and other global firms. 500+ consultations and referrals done.
                  </p>
                </div>
              </div>

              <div className="landing-leaders-stats" aria-label="Network results">
                <div className="landing-leaders-stat">
                  <span className="landing-leaders-stat-value">230+</span>
                  <span className="landing-leaders-stat-label">Consultations and referrals done</span>
                </div>
                <div className="landing-leaders-stat">
                  <span className="landing-leaders-stat-value">500+</span>
                  <span className="landing-leaders-stat-label">Alumni mentors</span>
                </div>
                <div className="landing-leaders-stat">
                  <span className="landing-leaders-stat-value">30+</span>
                  <span className="landing-leaders-stat-label">Global firms</span>
                </div>
              </div>

              <div className="landing-leader-showcase">
                <div className="landing-leader-logos" aria-label="Featured companies">
                  {PRIMARY_LEADER_COMPANIES.map((co) => (
                    <button
                      key={co.id}
                      type="button"
                      className={[
                        "landing-leader-logo-btn",
                        co.logoSurface === "dark" ? "landing-leader-logo-btn--logo-dark" : "",
                        co.logoSurface === "brand-navy" ? "landing-leader-logo-btn--logo-compact" : "",
                        co.logoSurface === "brand-amex" ? "landing-leader-logo-btn--logo-compact" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={`Connect via ${co.name}`}
                      aria-label={co.name}
                      onClick={() => setLeaderConnectCompany(co.name)}
                    >
                      <span className="landing-leader-logo-shell">
                        <img src={co.logo} alt="" className="landing-leader-logo" />
                      </span>
                    </button>
                  ))}
                </div>
                <div className="landing-leader-stack" aria-label="More companies">
                  {STACKED_LEADER_COMPANIES.map((co, index) => (
                    <button
                      key={co.id}
                      type="button"
                      className={[
                        "landing-leader-stack-btn",
                        co.id === "meta" ? "landing-leader-stack-btn--meta" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ zIndex: STACKED_LEADER_COMPANIES.length - index }}
                      title={`Connect via ${co.name}`}
                      onClick={() => setLeaderConnectCompany(co.name)}
                    >
                      <img src={co.logo} alt="" className="landing-leader-stack-logo" />
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="landing-card-btn landing-card-btn--primary landing-card-btn--leaders"
                onClick={() => setLeaderConnectCompany("McKinsey")}
              >
                Connect with Alumni
                <ArrowIcon />
              </button>
            </div>
          </article>

          <div className="landing-trust-panel">
            <div className="landing-trust-stats">
              <div className="landing-trust-stat">
                <span className="landing-trust-value">50,000+</span>
                <span className="landing-trust-label">Students</span>
              </div>
              <div className="landing-trust-stat">
                <span className="landing-trust-value">1M+</span>
                <span className="landing-trust-label">Questions attempted</span>
              </div>
              <div className="landing-trust-stat">
                <span className="landing-trust-value">500+</span>
                <span className="landing-trust-label">Alumni mentors</span>
              </div>
            </div>
            <div className="landing-trust-band">
              <div className="landing-trust-copy">
                <p className="landing-trust-band-title">Strong IIM, Banking, SSC &amp; Law alumni network</p>
                <p className="landing-trust-band-text">
                  Learn from toppers and connect with pioneers who cracked CAT, SSC, banking, and law exams.
                </p>
              </div>
              <button
                type="button"
                className="landing-trust-cta"
                onClick={() => setShowBooking(true)}
              >
                Connect with Pioneers
                <ArrowIcon />
              </button>
            </div>
          </div>
        </section>

        <section className="landing-section landing-exams" id="exam-categories">
          <h2 className="landing-exams-heading">Choose your exam category</h2>
          <p className="landing-exams-lead">
            CAT, GMAT, GRE, IELTS, CLAT, banking, SSC, railways, NDA, UPSC, MPSC, UGC NET, CTET, and MHT CET — tap a
            logo to see how AdapTest helps you prepare.
          </p>

          <div className="landing-exam-tabs" role="tablist" aria-label="Exam categories">
            {EXAM_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === item.id}
                aria-controls={`exam-panel-${item.id}`}
                id={`exam-tab-${item.id}`}
                className={`landing-exam-tab${activeCategory === item.id ? " landing-exam-tab--active" : ""}`}
                onClick={() => setActiveCategory(item.id)}
              >
                <span className="landing-exam-tab-icon">
                  <img src={item.logo} alt="" className="landing-exam-tab-logo" />
                </span>
                <span className="landing-exam-tab-label">{item.label}</span>
              </button>
            ))}
          </div>

          <div
            className="landing-exam-panel"
            role="tabpanel"
            id={`exam-panel-${category.id}`}
            aria-labelledby={`exam-tab-${category.id}`}
          >
            <div className="landing-exam-panel-head">
              <img src={category.logo} alt="" className="landing-exam-panel-logo" />
              <h3 className="landing-exam-panel-title">{category.title}</h3>
            </div>
            <p className="landing-exam-panel-text">{category.description}</p>
            <p className="landing-exam-panel-exams">
              <strong>Covers:</strong> {category.exams}
            </p>

            <div className="landing-exam-papers">
              <h4 className="landing-exam-papers-heading">Featured mock tests</h4>
              <p className="landing-exam-papers-lead">Unlock full-length papers for ₹100 · pay via UPI</p>
              {showcaseLoading ? (
                <p className="landing-exam-papers-loading">Loading papers…</p>
              ) : (
                <div className="landing-exam-papers-grid">
                  {showcasePapers.map((paper) =>
                    paper.locked ? (
                      <button
                        key={`${paper.category}-${paper.title}`}
                        type="button"
                        className="landing-exam-paper-card landing-exam-paper-card--locked"
                        onClick={() => onPaperClick(paper)}
                      >
                        <span className="landing-exam-paper-icon" aria-hidden>
                          <LockIcon />
                        </span>
                        <span className="landing-exam-paper-body">
                          <span className="landing-exam-paper-title">{paper.title}</span>
                          <span className="landing-exam-paper-meta">
                            {paper.section_count > 0
                              ? `${paper.section_count} section${paper.section_count === 1 ? "" : "s"}`
                              : "Full mock"}
                            {" · Locked · ₹100"}
                          </span>
                        </span>
                        <span className="landing-exam-paper-cta">Unlock</span>
                      </button>
                    ) : (
                      <Link
                        key={`${paper.category}-${paper.title}`}
                        to="/papers"
                        className="landing-exam-paper-card landing-exam-paper-card--unlocked"
                      >
                        <span className="landing-exam-paper-icon" aria-hidden>
                          ✓
                        </span>
                        <span className="landing-exam-paper-body">
                          <span className="landing-exam-paper-title">{paper.title}</span>
                          <span className="landing-exam-paper-meta">
                            {paper.section_count > 0
                              ? `${paper.section_count} section${paper.section_count === 1 ? "" : "s"}`
                              : "Full mock"}
                            {" · Unlocked"}
                          </span>
                        </span>
                        <span className="landing-exam-paper-cta landing-exam-paper-cta--open">Open</span>
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>

            <div className="landing-exam-panel-actions">
              <Link to={category.href} className="landing-btn-primary landing-btn-lg">
                Start {category.label} prep
                <ArrowIcon />
              </Link>
              <Link to="/challenges" className="landing-btn-secondary landing-btn-lg">
                View live challenges
              </Link>
            </div>
          </div>
        </section>
      </main>
      {showBooking ? <TopperBookingModal onClose={() => setShowBooking(false)} /> : null}
      {showConsultation ? <FreeConsultationModal onClose={() => setShowConsultation(false)} /> : null}
      {leaderConnectCompany ? (
        <LeaderConnectModal company={leaderConnectCompany} onClose={() => setLeaderConnectCompany(null)} />
      ) : null}
      {unlockPaper ? (
        <PaperUnlockModal
          paperId={unlockPaper.id}
          paperTitle={unlockPaper.title}
          onClose={() => setUnlockPaper(null)}
          onUnlocked={() => void loadShowcase(category.showcaseId)}
        />
      ) : null}
    </div>
  );
}
