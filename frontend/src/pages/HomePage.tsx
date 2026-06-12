import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
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
      <div className="page marketing-home">
        <ChallengesHomePage />
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
