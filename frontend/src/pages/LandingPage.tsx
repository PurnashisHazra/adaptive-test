import { Link } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { useAuthStore } from "../store/authStore";
import { TopperBookingModal } from "../components/TopperBookingModal";
import { LeaderConnectModal } from "../components/LeaderConnectModal";
import { PRIMARY_LEADER_COMPANIES, STACKED_LEADER_COMPANIES } from "../data/leaderCompanies";
import "../styles/landing.css";

type ExamCategoryId = "mba" | "law" | "banking" | "railways" | "defense";

type ExamCategory = {
  id: ExamCategoryId;
  label: string;
  title: string;
  description: string;
  exams: string;
  href: string;
  icon: ReactNode;
};

function MbaIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M8 18 24 10l16 8v4H8v-4Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M24 10v28M14 22v12M34 22v12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="10" y="34" width="28" height="6" rx="2" stroke="currentColor" strokeWidth="2.2" />
      <path d="M14 37h20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function LawIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M10 36h28M24 8v28"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M14 8 24 18l10-10M14 36l-6 4M34 36l6 4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="18" y="32" width="12" height="4" rx="1" fill="currentColor" />
    </svg>
  );
}

function BankingIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M24 8 6 18v4h36v-4L24 8Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M10 22v14M18 22v14M30 22v14M38 22v14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M6 36h36" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function RailwaysIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="10" y="14" width="28" height="20" rx="4" stroke="currentColor" strokeWidth="2.2" />
      <path d="M10 24h28M18 14v8M30 14v8" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="16" cy="38" r="3" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="32" cy="38" r="3" stroke="currentColor" strokeWidth="2.2" />
      <path d="M24 8v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function DefenseIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M24 6 8 14v12c0 10 6.5 15.5 16 18 9.5-2.5 16-8 16-18V14L24 6Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M24 16v14M18 22h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

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

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const EXAM_CATEGORIES: ExamCategory[] = [
  {
    id: "mba",
    label: "MBA",
    title: "MBA & CAT preparation",
    description:
      "Adaptive mock tests for CAT, XAT, and other MBA entrances. Difficulty adjusts after every answer so you drill weak topics and build exam-day speed.",
    exams: "CAT · XAT · SNAP · NMAT",
    href: "/cat-mock-test",
    icon: <MbaIcon />,
  },
  {
    id: "law",
    label: "Law",
    title: "Law entrance exams",
    description:
      "Practice CLAT, AILET, and other law entrances with timed sections, negative marking, and analytics that show where to improve before the real exam.",
    exams: "CLAT · AILET · SLAT · LSAT India",
    href: "/challenges",
    icon: <LawIcon />,
  },
  {
    id: "banking",
    label: "Banking",
    title: "Banking & insurance exams",
    description:
      "IBPS, SBI, and RRB-style mocks with quant, reasoning, and English. Live challenges and full-length papers keep your prep structured.",
    exams: "IBPS PO · IBPS Clerk · SBI · RRB",
    href: "/bank-exam-mock-test",
    icon: <BankingIcon />,
  },
  {
    id: "railways",
    label: "Railways",
    title: "Railway recruitment exams",
    description:
      "RRB NTPC, Group D, and ALP-style practice with sectional timing. Attempt live mocks and track accuracy trends across attempts.",
    exams: "RRB NTPC · Group D · ALP · JE",
    href: "/ssc-mock-test",
    icon: <RailwaysIcon />,
  },
  {
    id: "defense",
    label: "Defense",
    title: "Defense & government exams",
    description:
      "SSC CGL, CHSL, GD, and defense-oriented papers in one place. Adaptive difficulty helps you push from qualifying level to top ranks.",
    exams: "SSC CGL · CHSL · NDA · CDS",
    href: "/challenges",
    icon: <DefenseIcon />,
  },
];

export function LandingPage() {
  const role = useAuthStore((s) => s.role);
  const signedIn = role === "student";
  const startHref = signedIn ? "/challenges" : "/auth";
  const [showBooking, setShowBooking] = useState(false);
  const [leaderConnectCompany, setLeaderConnectCompany] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ExamCategoryId>("mba");

  const category = EXAM_CATEGORIES.find((c) => c.id === activeCategory) ?? EXAM_CATEGORIES[0];

  return (
    <div className="landing">
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
              <Link to={startHref} className="landing-btn-primary landing-btn-lg">
                Pick Your Exam
                <ArrowIcon />
              </Link>
              <a href="#exam-categories" className="landing-btn-secondary landing-btn-lg">
                Browse Exam Categories
              </a>
            </div>

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
                  <button
                    type="button"
                    className="landing-card-btn landing-card-btn--primary"
                    onClick={() => setShowBooking(true)}
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

            <article className="landing-card landing-card--light landing-card--leaders">
              <span className="landing-card-badge landing-card-badge--light">INDUSTRY INSIGHTS</span>
              <div className="landing-card-body landing-card-body--stack">
                <div className="landing-card-icon landing-card-icon--light">
                  <BriefcaseIcon />
                </div>
                <div>
                  <h2 className="landing-card-title">Listen from current business leaders</h2>
                  <p className="landing-card-text">
                    Connect with ex-students now at Apple, NVIDIA, Visa, AmEx, McKinsey, and other global firms.
                  </p>

                  <div className="landing-leader-logos" aria-label="Featured companies">
                    {PRIMARY_LEADER_COMPANIES.map((co) => (
                      <button
                        key={co.id}
                        type="button"
                        className={[
                          "landing-leader-logo-btn",
                          co.logoSurface === "dark" ? "landing-leader-logo-btn--dark" : "",
                          co.logoSurface === "brand-navy" ? "landing-leader-logo-btn--mckinsey" : "",
                          co.logoSurface === "brand-amex" ? "landing-leader-logo-btn--amex" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        title={`Connect via ${co.name}`}
                        aria-label={co.name}
                        onClick={() => setLeaderConnectCompany(co.name)}
                      >
                        <img src={co.logo} alt="" className="landing-leader-logo" />
                        <span className="landing-leader-logo-name">{co.shortName ?? co.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="landing-leader-stack-wrap">
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
                    <div className="landing-leader-stack-copy">
                      <span className="landing-leader-stack-caption">Google · Meta · Goldman · BCG · Amazon</span>
                      <span className="landing-leader-stack-sub">+ more global firms</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="landing-card-btn landing-card-btn--primary"
                    onClick={() => setLeaderConnectCompany("McKinsey")}
                  >
                    Connect with Alumni
                    <ArrowIcon />
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-section landing-exams" id="exam-categories">
          <h2 className="landing-exams-heading">Choose your exam category</h2>
          <p className="landing-exams-lead">Tap a category to see how AdapTest helps you prepare.</p>

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
                <span className="landing-exam-tab-icon">{item.icon}</span>
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
            <h3 className="landing-exam-panel-title">{category.title}</h3>
            <p className="landing-exam-panel-text">{category.description}</p>
            <p className="landing-exam-panel-exams">
              <strong>Covers:</strong> {category.exams}
            </p>
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
      {leaderConnectCompany ? (
        <LeaderConnectModal company={leaderConnectCompany} onClose={() => setLeaderConnectCompany(null)} />
      ) : null}
    </div>
  );
}
