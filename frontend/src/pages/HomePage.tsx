import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { Seo } from "../components/Seo";
import { SEO_HOME } from "../seo/pages";
import { faqPageJsonLd } from "../seo/jsonLd";
import { LandingPage } from "./LandingPage";

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

  if (role === "god" || role === "super_admin") {
    return <Navigate to="/super-admin" replace />;
  }

  if (role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <>
      <Seo seo={SEO_HOME} jsonLd={faqPageJsonLd(HOME_FAQS)} />
      <LandingPage />
    </>
  );
}
