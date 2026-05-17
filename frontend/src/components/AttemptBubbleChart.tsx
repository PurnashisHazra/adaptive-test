import type { AttemptQuestionStep } from "../api/types";

export function formatQuestionTime(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function difficultyRadius(difficulty: string): number {
  switch ((difficulty || "").toUpperCase()) {
    case "EXPERT":
      return 12;
    case "HARD":
      return 10;
    case "MEDIUM":
      return 8;
    case "EASY":
    default:
      return 6;
  }
}

export type BubbleChartStep = Pick<AttemptQuestionStep, "sequence" | "question_text" | "difficulty" | "time_spent_seconds" | "is_correct">;

export function AttemptBubbleChart({
  steps,
  chartKey,
  chartW = 760,
  chartH = 260,
}: {
  steps: BubbleChartStep[];
  chartKey: string;
  chartW?: number;
  chartH?: number;
}) {
  const padL = 52;
  const padR = 18;
  const padT = 14;
  const padB = 34;
  const maxX = Math.max(1, ...steps.map((s) => s.sequence));
  const maxY = Math.max(5, ...steps.map((s) => s.time_spent_seconds ?? 0));
  const xToPx = (x: number) => padL + ((x - 1) / Math.max(1, maxX - 1)) * (chartW - padL - padR);
  const yToPx = (y: number) => chartH - padB - (y / maxY) * (chartH - padT - padB);

  return (
    <div className="table-wrap" style={{ overflowX: "auto", paddingBottom: "0.25rem" }}>
      <svg
        width={chartW}
        height={chartH}
        role="img"
        aria-label={`Attempt ${chartKey} bubble chart`}
        style={{ display: "block", minWidth: chartW }}
      >
        <line x1={padL} y1={chartH - padB} x2={chartW - padR} y2={chartH - padB} stroke="#cbd5e1" />
        <line x1={padL} y1={padT} x2={padL} y2={chartH - padB} stroke="#cbd5e1" />
        <text x={chartW / 2} y={chartH - 8} textAnchor="middle" fill="#64748b" fontSize="12">
          Question sequence
        </text>
        <text x={18} y={chartH / 2} textAnchor="middle" transform={`rotate(-90 18 ${chartH / 2})`} fill="#64748b" fontSize="12">
          Time (seconds)
        </text>
        {[0, 0.25, 0.5, 0.75, 1].map((r) => {
          const yVal = Math.round(maxY * r);
          const y = yToPx(yVal);
          return (
            <g key={`${chartKey}-y-${r}`}>
              <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#f1f5f9" />
              <text x={padL - 8} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="11">
                {yVal}
              </text>
            </g>
          );
        })}
        {steps.map((step) => {
          const cx = xToPx(step.sequence);
          const cy = yToPx(step.time_spent_seconds ?? 0);
          const rad = difficultyRadius(step.difficulty);
          const fill = step.is_correct ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)";
          const stroke = step.is_correct ? "#059669" : "#dc2626";
          return (
            <g key={`${chartKey}-${step.sequence}`}>
              <circle cx={cx} cy={cy} r={rad} fill={fill} stroke={stroke} />
              <title>{`#${step.sequence} ${step.difficulty} · ${formatQuestionTime(step.time_spent_seconds)} · ${step.is_correct ? "Correct" : "Incorrect"} · ${step.question_text}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
