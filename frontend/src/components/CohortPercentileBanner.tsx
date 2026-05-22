import type { CSSProperties, ReactNode } from "react";

export type CohortPercentileFields = {
  cohort_percentile?: number | null;
  cohort_ranked_count?: number;
  percentile_is_final?: boolean;
  your_score_better_than_percent?: number | null;
};

function resolvePercentile(data: CohortPercentileFields): number | null | undefined {
  const v = data.cohort_percentile ?? data.your_score_better_than_percent;
  return v == null || Number.isNaN(v) ? null : v;
}

export function CohortPercentileBanner({
  data,
  label = "Overall percentile",
}: {
  data: CohortPercentileFields;
  label?: string;
}) {
  const n = data.cohort_ranked_count ?? 0;
  const pct = resolvePercentile(data);
  const isFinal = Boolean(data.percentile_is_final);

  const boxStyle: CSSProperties = {
    marginTop: "1rem",
    padding: "1rem 1.1rem",
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    borderLeft: `4px solid ${isFinal ? "#059669" : "#6366f1"}`,
    background: isFinal ? "#ecfdf5" : "#f5f3ff",
    color: "#1e1b4b",
    fontSize: "0.95rem",
    lineHeight: 1.55,
  };

  let body: ReactNode;
  if (pct == null) {
    body = (
      <p style={{ margin: 0, color: "#4338ca" }}>
        Your <strong>{label.toLowerCase()}</strong> will appear here once your attempt has a final score and others have completed.
      </p>
    );
  } else if (n <= 1) {
    body = (
      <p style={{ margin: 0, color: "#4338ca" }}>
        <strong>{n === 1 ? "Only one scored attempt" : "No scored attempts"}</strong> in this cohort yet.
        {n === 1 ? " Percentile compares you to others once more students finish." : ""}
      </p>
    );
  } else {
    body = (
      <p style={{ margin: 0, color: isFinal ? "#064e3b" : "#312e81" }}>
        {isFinal ? <strong>Final percentile</strong> : <strong>Current percentile</strong>}:{" "}
        <strong style={{ fontSize: "1.15em" }}>{pct.toFixed(1)}</strong>
        <span style={{ fontWeight: 600 }}>th</span> among <strong>{n}</strong> scored attempt{n === 1 ? "" : "s"}.
        {!isFinal ? " Updates as more students complete." : ""}
      </p>
    );
  }

  return (
    <div style={boxStyle} role="status">
      {body}
    </div>
  );
}
