import { Link } from "react-router-dom";
import { Seo } from "../../components/Seo";
import { SeoFooter } from "../../components/SeoFooter";
import { AdaptiveTestPitch } from "../../components/AdaptiveTestPitch";
import { SEO_MOCK_TESTS_HUB } from "../../seo/pages";
import { faqPageJsonLd } from "../../seo/jsonLd";

const CARDS = [
  {
    to: "/cat-mock-test",
    title: "CAT mock test",
    desc: "MBA entrance — VARC, DILR, QA with adaptive difficulty and full-length papers.",
    keywords: "CAT mocks, CAT 2025, CAT 2026",
  },
  {
    to: "/ssc-mock-test",
    title: "SSC mock test",
    desc: "CGL, CHSL, MTS, GD — timed government exam mocks with negative marking.",
    keywords: "SSC CGL mock, SSC CHSL",
  },
  {
    to: "/bank-exam-mock-test",
    title: "Bank exam mock test",
    desc: "IBPS PO, Clerk, RRB, SBI — reasoning, quant, English, and GA sections.",
    keywords: "IBPS mock, SBI PO mock",
  },
] as const;

const FAQS = [
  {
    question: "What is AdapTest?",
    answer:
      "AdapTest is an adaptive testing platform for competitive exams in India. After each answer, AI picks the next question based on your accuracy, speed, and knowledge—so mocks stay at the right difficulty.",
  },
  {
    question: "Which mock tests are available?",
    answer:
      "Students attempt CAT mocks, SSC mock tests, bank exam mocks, and institute-specific papers assigned by admins. Live challenges appear on the home page.",
  },
  {
    question: "How do I start a free mock test?",
    answer: "Create an account on the sign-in page, then open Home for challenges or Take test for adaptive practice.",
  },
];

export function MockTestsHubPage() {
  return (
    <>
      <Seo seo={SEO_MOCK_TESTS_HUB} jsonLd={faqPageJsonLd(FAQS)} />
      <div className="page seo-landing app-page">
        <div className="content-inner seo-landing__inner">
          <header className="seo-landing__hero">
            <p className="seo-landing__eyebrow">Mock test library</p>
            <h1 className="seo-landing__h1">Online mock tests for CAT, SSC & bank exams</h1>
            <p className="seo-landing__intro">
              AdapTest combines live challenges, full-length papers, and adaptive practice tests in one platform—built
              for Indian competitive exam aspirants who want mocks that actually match their level.
            </p>
            <Link to="/auth" className="btn btn-primary">
              Create free account
            </Link>
          </header>

          <section className="seo-landing__section">
            <h2 className="seo-landing__h2">Choose your exam</h2>
            <ul className="seo-hub__grid">
              {CARDS.map((c) => (
                <li key={c.to}>
                  <Link to={c.to} className="seo-hub__card card">
                    <h3>{c.title}</h3>
                    <p>{c.desc}</p>
                    <span className="seo-hub__keywords">{c.keywords}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <AdaptiveTestPitch showCta signedIn={false} />

          <section className="seo-landing__section seo-landing__faq">
            <h2 className="seo-landing__h2">FAQ</h2>
            <dl className="seo-landing__faq-list">
              {FAQS.map((f) => (
                <div key={f.question} className="seo-landing__faq-item">
                  <dt>{f.question}</dt>
                  <dd>{f.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <SeoFooter />
      </div>
    </>
  );
}
