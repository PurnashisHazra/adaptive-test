import { MarketingExamLanding } from "../../components/MarketingExamLanding";
import { SEO_CAT_MOCK } from "../../seo/pages";

const FAQS = [
  {
    question: "Is the CAT mock test on AdapTest free?",
    answer:
      "You can sign up for a free AdapTest account and attempt adaptive practice tests and scheduled challenges. Your institute or admin may also assign full-length CAT-style papers.",
  },
  {
    question: "How is an adaptive CAT mock different from a fixed mock?",
    answer:
      "After each answer, AdapTest evaluates your accuracy, speed, and knowledge signal, then selects the next question difficulty. Strong performers see harder items sooner; others build up from fundamentals.",
  },
  {
    question: "Does AdapTest cover VARC, DILR, and QA?",
    answer:
      "Yes. Question papers and challenges can include all three CAT sections with sectional timing, marking scheme, and review—matching how you prepare for the actual MBA entrance test.",
  },
  {
    question: "Can I compare my CAT mock performance with others?",
    answer:
      "Live challenges show participant counts and cohort-style analytics where enabled. Your performance tab tracks learning curves, radar skills, and strategy to raise your score over attempts.",
  },
];

export function CatMockTestPage() {
  return (
    <MarketingExamLanding
      seo={SEO_CAT_MOCK}
      h1="CAT mock test online — adaptive practice for MBA entrance"
      intro="Prepare for CAT 2025 and CAT 2026 with mocks that react to how you solve. AdapTest is built for serious aspirants who want more than a static PDF: timed sections, negative marking, instant review, and AI-driven next-question selection."
      course={{
        name: "CAT Mock Test — Adaptive Practice",
        description: "Online CAT mock tests with adaptive difficulty for VARC, DILR, and QA.",
        keywords: SEO_CAT_MOCK.keywords ?? [],
      }}
      sections={[
        {
          heading: "Why take CAT mocks on AdapTest?",
          paragraphs: [
            "Most CAT mock test platforms give everyone the same paper. That wastes time on questions that are too easy or demoralising when the paper is too hard. AdapTest adapts after every response so your CAT mocks stay in the productive difficulty band.",
            "Use standalone adaptive practice when you want a quick drill, or join live challenges when your coaching schedule runs a platform-wide mock—same account, same analytics.",
          ],
          bullets: [
            "Adaptive next question based on accuracy, speed, and knowledge",
            "Full-length and sectional CAT-style papers",
            "Timed attempts with exam-like navigation",
            "Review with difficulty breakdown and coach-style insights",
          ],
        },
        {
          heading: "CAT mock test pattern we support",
          paragraphs: [
            "Administrators configure papers to mirror the Common Admission Test: three sections, composite timing or per-section clocks, +3/−1 style marking where applicable, and question types across reading comprehension, data interpretation, logical reasoning, and quantitative aptitude.",
          ],
        },
        {
          heading: "Best way to use CAT mocks in your study plan",
          paragraphs: [
            "Attempt two to three adaptive mocks per week, review every incorrect and skipped item within 24 hours, and track accuracy lift on the Performance tab. Pair mocks with section-wise drills when your radar shows a weak axis—VARC speed, DILR sets, or QA fundamentals.",
          ],
        },
      ]}
      faqs={FAQS}
      relatedLinks={[
        { href: "/ssc-mock-test", label: "SSC mock test" },
        { href: "/bank-exam-mock-test", label: "Bank exam mock test" },
        { href: "/mock-tests", label: "All online mock tests" },
      ]}
    />
  );
}
