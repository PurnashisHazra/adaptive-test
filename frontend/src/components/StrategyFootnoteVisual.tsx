import type { StrategyCounterfactualInsights, StrategyInsightCardTone, StrategyInsightDonut } from "../lib/strategyCounterfactual";

function DonutChart({ donut, size = 108 }: { donut: StrategyInsightDonut; size?: number }) {
  const total = donut.segments.reduce((s, seg) => s + Math.max(0, seg.value), 0) || 1;
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 13;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <figure className="strategy-donut" aria-label={`${donut.title}: ${donut.caption}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {donut.segments.map((seg, i) => {
          const len = (Math.max(0, seg.value) / total) * circumference;
          const dash = `${len} ${circumference - len}`;
          const el = (
            <circle
              key={`${seg.label}-${i}`}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += len;
          return el;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="strategy-donut__center">
          {donut.centerLabel}
        </text>
        {donut.centerSub ? (
          <text x={cx} y={cy + 12} textAnchor="middle" className="strategy-donut__sub">
            {donut.centerSub}
          </text>
        ) : null}
      </svg>
      <figcaption className="strategy-donut__legend">
        {donut.segments.map((seg) => (
          <span key={seg.label} className="strategy-donut__legend-row">
            <span className="strategy-donut__swatch" style={{ background: seg.color }} aria-hidden />
            <span>{seg.label}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function cardToneClass(tone: StrategyInsightCardTone): string {
  switch (tone) {
    case "accent":
      return "strategy-insight-card--accent";
    case "time":
      return "strategy-insight-card--time";
    case "warn":
      return "strategy-insight-card--warn";
    default:
      return "strategy-insight-card--neutral";
  }
}

export function StrategyFootnoteVisual({ insights }: { insights: StrategyCounterfactualInsights }) {
  return (
    <section className="strategy-insights" aria-label="Strategy lift summary">
      <header className="strategy-insights__head">
        <h4 className="strategy-insights__title">How the curves relate to your profile</h4>
        <p className="strategy-insights__lead">{insights.lead}</p>
      </header>

      <div className="strategy-insights__donuts">
        {insights.donuts.map((donut) => (
          <article key={donut.id} className="strategy-insights__donut-card">
            <h5 className="strategy-insights__donut-title">{donut.title}</h5>
            <DonutChart donut={donut} />
            <p className="strategy-insights__donut-caption">{donut.caption}</p>
          </article>
        ))}
      </div>

      <div className="strategy-insights__cards">
        <h5 className="strategy-insights__cards-title">Suggested focus</h5>
        <div className="strategy-insights__cards-grid">
          {insights.cards.map((card) => (
            <article key={card.id} className={["strategy-insight-card", cardToneClass(card.tone)].join(" ")}>
              <div className="strategy-insight-card__head">
                <h6 className="strategy-insight-card__title">{card.title}</h6>
                {card.metric ? <span className="strategy-insight-card__metric">{card.metric}</span> : null}
              </div>
              <p className="strategy-insight-card__body">{card.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
