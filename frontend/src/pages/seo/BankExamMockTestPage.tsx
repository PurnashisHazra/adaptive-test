import { MarketingExamLanding } from "../../components/MarketingExamLanding";
import { SEO_BANK_MOCK } from "../../seo/pages";

const FAQS = [
  {
    question: "Does AdapTest have IBPS PO and Clerk mock tests?",
    answer:
      "Banks and coaching admins publish papers labelled for IBPS PO, Clerk, RRB, and SBI patterns. Browse live challenges on the home page or ask your institute to assign a paper.",
  },
  {
    question: "Are banking mocks adaptive?",
    answer:
      "Yes. Standalone practice and many challenges use AdapTest AI to adjust difficulty based on your last answers—useful for scaling quant and reasoning speed under time pressure.",
  },
  {
    question: "Can I practise only reasoning or only quant?",
    answer:
      "Sectional papers can focus on reasoning ability, quantitative aptitude, English language, or general awareness depending on how your admin builds the test.",
  },
];

export function BankExamMockTestPage() {
  return (
    <MarketingExamLanding
      seo={SEO_BANK_MOCK}
      h1="Bank exam mock test — IBPS, SBI & RRB practice online"
      intro="Clearing IBPS PO, Clerk, or SBI exams takes consistent mocks. AdapTest offers bank exam mock tests with adaptive difficulty, sectional timing, and analytics built for banking aspirants in India."
      course={{
        name: "Bank Exam Mock Test — IBPS & SBI Practice",
        description: "Banking mock tests for IBPS PO, Clerk, RRB, and SBI with adaptive practice.",
        keywords: SEO_BANK_MOCK.keywords ?? [],
      }}
      sections={[
        {
          heading: "What you get in a banking mock on AdapTest",
          paragraphs: [
            "Each bank mock test can mirror prelims and mains structure: multiple sections, composite time, and negative marking. After submission, review questions by difficulty and topic to plan the next study block.",
          ],
          bullets: [
            "Reasoning & computer aptitude sections",
            "Quantitative aptitude and data interpretation",
            "English language and general/banking awareness (as configured)",
            "Adaptive practice when assigned by your coach",
          ],
        },
        {
          heading: "IBPS mock test schedule with live challenges",
          paragraphs: [
            "Coaching schedules platform-wide IBPS mock test windows—students join from the home page, see participants, and finish within the launch–end window like a real exam slot.",
          ],
        },
      ]}
      faqs={FAQS}
      relatedLinks={[
        { href: "/cat-mock-test", label: "CAT mock test" },
        { href: "/ssc-mock-test", label: "SSC mock test" },
        { href: "/mock-tests", label: "All online mock tests" },
      ]}
    />
  );
}
