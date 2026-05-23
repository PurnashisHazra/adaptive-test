import { SITE_NAME, SITE_TAGLINE } from "./site";
import type { PageSeo } from "./types";

function page(partial: PageSeo): PageSeo {
  return partial;
}

export const SEO_HOME: PageSeo = page({
  path: "/",
  title: `${SITE_NAME} — Free CAT Mock Test & SSC Mock Test Online | Adaptive Mocks`,
  description:
    "Practice CAT mocks and SSC mock tests online. AdapTest adapts every next question to your accuracy, speed, and knowledge—timed challenges, full-length papers, and performance analytics.",
  keywords: [
    "CAT mock test",
    "CAT mocks",
    "SSC mock test",
    "SSC CGL mock",
    "free mock test",
    "adaptive mock test",
    "online mock test India",
  ],
});

export const SEO_MOCK_TESTS_HUB: PageSeo = page({
  path: "/mock-tests",
  title: `Online Mock Tests for CAT, SSC & Bank Exams | ${SITE_NAME}`,
  description:
    "Browse adaptive mock tests for MBA CAT, SSC CGL/CHSL, and banking exams. Live challenges, sectional timing, negative marking, and AI-driven difficulty on AdapTest.",
  keywords: ["online mock test", "competitive exam mock", "SSC mock", "CAT mock", "bank mock test"],
});

export const SEO_CAT_MOCK: PageSeo = page({
  path: "/cat-mock-test",
  title: `CAT Mock Test Online Free — Adaptive CAT Mocks | ${SITE_NAME}`,
  description:
    "Take CAT mock tests that adapt to your level. VARC, DILR, and QA practice with timed sections, instant review, and strategy insights—built for CAT 2025 & 2026 aspirants.",
  keywords: [
    "CAT mock test",
    "CAT mocks",
    "CAT mock test online",
    "free CAT mock",
    "CAT practice test",
    "MBA entrance mock",
    "adaptive CAT mock",
  ],
});

export const SEO_SSC_MOCK: PageSeo = page({
  path: "/ssc-mock-test",
  title: `SSC Mock Test Online — CGL, CHSL & GD Adaptive Mocks | ${SITE_NAME}`,
  description:
    "SSC mock tests for CGL, CHSL, MTS, and GD with real exam patterns. Adaptive difficulty, timed papers, negative marking, and detailed analytics on AdapTest.",
  keywords: [
    "SSC mock test",
    "SSC CGL mock",
    "SSC CHSL mock test",
    "SSC mock test online",
    "free SSC mock",
    "government exam mock",
  ],
});

export const SEO_BANK_MOCK: PageSeo = page({
  path: "/bank-exam-mock-test",
  title: `Bank Exam Mock Test — IBPS PO, Clerk & SBI Practice | ${SITE_NAME}`,
  description:
    "Banking mock tests for IBPS PO, Clerk, RRB, and SBI with quantitative, reasoning, and English sections. Adaptive practice and live challenges on AdapTest.",
  keywords: [
    "bank mock test",
    "IBPS mock test",
    "SBI PO mock",
    "banking exam mock online",
    "IBPS clerk mock test",
  ],
});

export const SEO_AUTH: PageSeo = page({
  path: "/auth",
  title: `Sign in — ${SITE_NAME}`,
  description: `Create a free ${SITE_NAME} account to attempt CAT mocks, SSC mock tests, and live challenges. ${SITE_TAGLINE}`,
  noindex: true,
});

export const SEO_BY_PATH: Record<string, PageSeo> = {
  "/": SEO_HOME,
  "/mock-tests": SEO_MOCK_TESTS_HUB,
  "/cat-mock-test": SEO_CAT_MOCK,
  "/ssc-mock-test": SEO_SSC_MOCK,
  "/bank-exam-mock-test": SEO_BANK_MOCK,
  "/auth": SEO_AUTH,
};
