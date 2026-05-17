export type NumpadCellVisual =
  | "locked"
  | "visitedUnanswered"
  | "answered"
  | "markedUnanswered"
  | "answeredMarked"
  | "skipped";

function kindForIndex(
  index: number,
  totalQuestions: number,
  maxReachableIndex: number,
  questionsAnswered: number,
  markedForReview: Set<number>,
  skippedIndices: Set<number>,
): NumpadCellVisual {
  if (index > totalQuestions) return "locked";
  if (skippedIndices.has(index)) return "skipped";
  if (index > maxReachableIndex) return "locked";
  const marked = markedForReview.has(index);
  if (index <= questionsAnswered) {
    return marked ? "answeredMarked" : "answered";
  }
  if (index === questionsAnswered + 1) {
    return marked ? "markedUnanswered" : "visitedUnanswered";
  }
  return "locked";
}

export function computePaletteStats(
  totalQuestions: number,
  maxReachableIndex: number,
  questionsAnswered: number,
  markedForReview: number[],
  skippedIndices: number[] = [],
) {
  const marked = new Set(markedForReview);
  const skipped = new Set(skippedIndices);
  let answeredMarked = 0;
  let markedOnly = 0;
  for (const i of marked) {
    if (skipped.has(i)) continue;
    if (i <= questionsAnswered) answeredMarked += 1;
    else markedOnly += 1;
  }
  let answered = 0;
  for (let i = 1; i <= questionsAnswered; i += 1) {
    if (!skipped.has(i)) answered += 1;
  }
  const notAnswered = maxReachableIndex > questionsAnswered && !skipped.has(questionsAnswered + 1) ? 1 : 0;
  const notVisited = Math.max(0, totalQuestions - maxReachableIndex);
  return {
    answered,
    notAnswered,
    notVisited,
    markedOnly,
    answeredMarked,
    skipped: skipped.size,
  };
}

function PaletteLegend({ variant, stats }: { variant: "default" | "exam"; stats: ReturnType<typeof computePaletteStats> }) {
  const count = (n: number) => (variant === "exam" ? <span className="qnp-legend__counts">{n} </span> : null);
  return (
    <div className="qnp-legend" aria-hidden>
      <div className="qnp-legend__row">
        <span className="qnp-legend__sample qnp-cell qnp-cell--answered qnp-legend__mini" />
        <span>{count(stats.answered)}Answered</span>
      </div>
      <div className="qnp-legend__row">
        <span className="qnp-legend__sample qnp-cell qnp-cell--visitedUnanswered qnp-legend__mini" />
        <span>{count(stats.notAnswered)}Not Answered</span>
      </div>
      <div className="qnp-legend__row">
        <span className="qnp-legend__sample qnp-cell qnp-cell--locked qnp-legend__mini" />
        <span>{count(stats.notVisited)}Not Visited</span>
      </div>
      <div className="qnp-legend__row">
        <span className="qnp-legend__sample qnp-cell qnp-cell--markedUnanswered qnp-legend__mini" />
        <span>{count(stats.markedOnly)}Marked for Review</span>
      </div>
      <div className="qnp-legend__row">
        <span className="qnp-legend__sample qnp-cell qnp-cell--skipped qnp-legend__mini" />
        <span>{count(stats.skipped)}Skipped</span>
      </div>
      <div className="qnp-legend__row">
        <span className="qnp-legend__answered-marked-wrap">
          <span className="qnp-cell qnp-cell--answeredMarked qnp-legend__mini">
            <span className="qnp-cell__num">5</span>
            <span className="qnp-cell__badge" />
          </span>
        </span>
        <span>{count(stats.answeredMarked)}Answered &amp; Marked for Review</span>
      </div>
    </div>
  );
}

export function QuestionNumpad(props: {
  totalQuestions: number;
  currentIndex: number;
  maxReachableIndex: number;
  questionsAnswered: number;
  markedForReview: number[];
  skippedIndices?: number[];
  loadingIndex: number | null;
  onSelect: (index: number) => void;
  variant?: "default" | "exam";
  sectionTitle?: string;
}) {
  const {
    totalQuestions,
    currentIndex,
    maxReachableIndex,
    questionsAnswered,
    markedForReview,
    skippedIndices = [],
    loadingIndex,
    onSelect,
    variant = "default",
    sectionTitle,
  } = props;
  const marked = new Set(markedForReview);
  const skipped = new Set(skippedIndices);
  const stats = computePaletteStats(totalQuestions, maxReachableIndex, questionsAnswered, markedForReview, skippedIndices);
  const cells = Array.from({ length: totalQuestions }, (_, i) => i + 1);

  const grid = (
    <div className="qnp-grid">
      {cells.map((n) => {
        const kind = kindForIndex(n, totalQuestions, maxReachableIndex, questionsAnswered, marked, skipped);
        const enabled = n <= maxReachableIndex && n >= 1 && !skipped.has(n);
        const isCurrent = n === currentIndex;
        const loading = loadingIndex === n;
        return (
          <button
            key={n}
            type="button"
            className={[
              "qnp-cell",
              `qnp-cell--${kind}`,
              isCurrent ? "qnp-cell--current" : "",
              loading ? "qnp-cell--loading" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={!enabled || loading}
            aria-current={isCurrent ? "true" : undefined}
            aria-label={`Question ${n}${kind === "locked" ? " (not available yet)" : kind === "skipped" ? " (skipped)" : ""}`}
            onClick={() => enabled && onSelect(n)}
          >
            <span className="qnp-cell__num">{n}</span>
            {kind === "answeredMarked" && <span className="qnp-cell__badge" aria-hidden />}
          </button>
        );
      })}
    </div>
  );

  if (variant === "exam") {
    return (
      <>
        <PaletteLegend variant="exam" stats={stats} />
        {sectionTitle ? <p className="exam-sidebar__palette-title">{sectionTitle}</p> : null}
        <p className="exam-sidebar__hint">Choose a Question</p>
        {grid}
      </>
    );
  }

  return (
    <div className="qnp-wrap card" style={{ margin: 0 }}>
      <p className="qnp-title">Question palette</p>
      {grid}
      <PaletteLegend variant="default" stats={stats} />
    </div>
  );
}
