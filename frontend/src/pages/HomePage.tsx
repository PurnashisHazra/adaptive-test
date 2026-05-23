import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { AdaptiveTestPitch } from "../components/AdaptiveTestPitch";
import { Seo } from "../components/Seo";
import { SeoFooter } from "../components/SeoFooter";
import { ChallengesHomePage } from "./ChallengesHomePage";
import { SEO_HOME } from "../seo/pages";
import { faqPageJsonLd } from "../seo/jsonLd";

const HOME_FAQS = [
  {
    question: "What is AdapTest?",
    answer:
      "AdapTest is an adaptive mock test platform for CAT, SSC, and bank exams in India. Questions adapt after each answer based on your accuracy, speed, and knowledge.",
  },
  {
    question: "Where can I take a CAT mock test or SSC mock test?",
    answer:
      "Sign in free, then use Home for live challenges or visit our CAT mock test and SSC mock test pages to learn how adaptive practice works.",
  },
];

function MarketingLanding() {
  return (
    <>
      <Seo seo={SEO_HOME} jsonLd={faqPageJsonLd(HOME_FAQS)} />
      <div className="page">
        <div className="content-inner">
          <header className="seo-home-hero">
            <h1 className="seo-home-hero__h1">CAT mock test &amp; SSC mock test — adaptive, online, free to start</h1>
            <p className="seo-home-hero__lead">
              AdapTest is built for competitive exam aspirants in India: live challenges, full-length papers, and
              AI-driven mocks that adjust after every answer.{" "}
              <Link to="/cat-mock-test">CAT mocks</Link>, <Link to="/ssc-mock-test">SSC mocks</Link>, and{" "}
              <Link to="/bank-exam-mock-test">bank exam practice</Link> in one place.
            </p>
          </header>
          <AdaptiveTestPitch signedIn={false} />
        </div>
        <ChallengesHomePage hideAdaptivePitch />
        <div className="content-inner seo-home-faq">
          <h2 className="seo-landing__h2">Mock tests FAQ</h2>
          <dl className="seo-landing__faq-list">
            {HOME_FAQS.map((f) => (
              <div key={f.question} className="seo-landing__faq-item">
                <dt>{f.question}</dt>
                <dd>{f.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
        <SeoFooter />
      </div>
    </>
  );
}

export function HomePage() {
  const role = useAuthStore((s) => s.role);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  if (!isHydrated) {
    return (
      <div className="page">
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  if (role === "super_admin") {
    return <Navigate to="/super-admin" replace />;
  }

  if (role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (role === "student") {
    return <ChallengesHomePage />;
  }

  return <MarketingLanding />;
}
