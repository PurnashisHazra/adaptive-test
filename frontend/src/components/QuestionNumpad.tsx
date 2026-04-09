export type NumpadCellVisual =
  | "locked"
  | "visitedUnanswered"
  | "answered"
  | "markedUnanswered"
  | "answeredMarked";

function kindForIndex(
  index: number,
  totalQuestions: number,
  maxReachableIndex: number,
  questionsAnswered: number,
  markedForReview: Set<number>
): NumpadCellVisual {
  if (index > totalQuestions) return "locked";
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

export function QuestionNumpad(props: {
  totalQuestions: number;
  currentIndex: number;
  maxReachableIndex: number;
  questionsAnswered: number;
  markedForReview: number[];
  loadingIndex: number | null;
  onSelect: (index: number) => void;
}) {
  const {
    totalQuestions,
    currentIndex,
    maxReachableIndex,
    questionsAnswered,
    markedForReview,
    loadingIndex,
    onSelect,
  } = props;
  const marked = new Set(markedForReview);

  const cells = Array.from({ length: totalQuestions }, (_, i) => i + 1);

  return (
    <div className="qnp-wrap card" style={{ margin: 0 }}>
      <p className="qnp-title">Question palette</p>
      <div className="qnp-grid">
        {cells.map((n) => {
          const kind = kindForIndex(n, totalQuestions, maxReachableIndex, questionsAnswered, marked);
          const enabled = n <= maxReachableIndex && n >= 1;
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
              aria-label={`Question ${n}${kind === "locked" ? " (not available yet)" : ""}`}
              onClick={() => enabled && onSelect(n)}
            >
              <span className="qnp-cell__num">{n}</span>
              {kind === "answeredMarked" && <span className="qnp-cell__badge" aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="qnp-legend" aria-hidden>
        <div className="qnp-legend__row">
          <span className="qnp-legend__sample qnp-cell qnp-cell--locked qnp-legend__mini" />
          <span>Not visited</span>
        </div>
        <div className="qnp-legend__row">
          <span className="qnp-legend__sample qnp-cell qnp-cell--visitedUnanswered qnp-legend__mini" />
          <span>Visited, not answered</span>
        </div>
        <div className="qnp-legend__row">
          <span className="qnp-legend__sample qnp-cell qnp-cell--answered qnp-legend__mini" />
          <span>Answered</span>
        </div>
        <div className="qnp-legend__row">
          <span className="qnp-legend__sample qnp-cell qnp-cell--markedUnanswered qnp-legend__mini" />
          <span>Marked for review (not answered)</span>
        </div>
        <div className="qnp-legend__row">
          <span className="qnp-legend__answered-marked-wrap">
            <span className="qnp-cell qnp-cell--answeredMarked qnp-legend__mini">
              <span className="qnp-cell__num">5</span>
              <span className="qnp-cell__badge" />
            </span>
          </span>
          <span>Answered &amp; marked for review</span>
        </div>
      </div>
    </div>
  );
}
