import { MarketingExamLanding } from "../../components/MarketingExamLanding";
import { SEO_SSC_MOCK } from "../../seo/pages";

const FAQS = [
  {
    question: "Which SSC exams can I practise on AdapTest?",
    answer:
      "Coaching teams configure challenges and papers for SSC CGL, CHSL, MTS, GD, and other staff selection patterns. Check the home page for live and upcoming SSC mock tests.",
  },
  {
    question: "Are SSC mock tests timed like the real exam?",
    answer:
      "Yes. Papers support section timers, total duration, and instructions shown before you start—so your SSC mock test feels like exam day.",
  },
  {
    question: "Is there negative marking in SSC mocks?",
    answer:
      "Marking follows the paper your admin publishes—typically negative marks on wrong answers for Tier-style tests. Your score and review reflect the same rules.",
  },
  {
    question: "What is adaptive difficulty for SSC?",
    answer:
      "If you are accurate and fast on easy items, AdapTest surfaces harder reasoning and quant questions. If you struggle, the engine holds difficulty until your accuracy improves—ideal for building SSC fundamentals.",
  },
];

export function SscMockTestPage() {
  return (
    <MarketingExamLanding
      seo={SEO_SSC_MOCK}
      h1="SSC mock test online — CGL, CHSL & government exam practice"
      intro="SSC aspirants need volume and realism. AdapTest delivers SSC mock tests with real exam timing, negative marking, and adaptive question paths so every attempt pushes you at the right level—not too easy, not overwhelming."
      course={{
        name: "SSC Mock Test — CGL & CHSL Adaptive Practice",
        description: "Online SSC mock tests for CGL, CHSL, and other staff selection exams.",
        keywords: SEO_SSC_MOCK.keywords ?? [],
      }}
      sections={[
        {
          heading: "SSC mock test features you'll use daily",
          paragraphs: [
            "From free SSC mock test sprints to coach-scheduled challenges, AdapTest keeps practice in one place. Students see upcoming and live contests on the home page, resume in-progress attempts, and open detailed review when a paper ends.",
          ],
          bullets: [
            "General intelligence, reasoning, quant, and English papers",
            "Live SSC challenges with countdown timers",
            "Performance analytics and strategy recommendations",
            "Mobile-friendly test UI for practice on the go",
          ],
        },
        {
          heading: "SSC CGL mock test vs CHSL mock test",
          paragraphs: [
            "Tier and post-specific papers differ in duration and difficulty mix. Your institute assigns the right SSC CGL mock or CHSL mock test; AdapTest records attempts separately so you can compare scores across weeks.",
          ],
        },
        {
          heading: "How to rank higher with better SSC mocks",
          paragraphs: [
            "Treat every SSC mock test as a dress rehearsal: read instructions, manage section time, mark questions for review, and submit cleanly. After the mock, use analytics to fix recurring traps—percentage shortcuts, puzzle types, or grammar rules—before the next attempt.",
          ],
        },
      ]}
      faqs={FAQS}
      relatedLinks={[
        { href: "/cat-mock-test", label: "CAT mock test" },
        { href: "/bank-exam-mock-test", label: "Bank exam mock test" },
        { href: "/mock-tests", label: "All online mock tests" },
      ]}
    />
  );
}
