import { useMemo } from "react";
import type { StudentPerformanceInsights, StudentQuestionReview } from "../api/types";

type AxisScore = {
  label: string;
  strength: number;
  weakness: number;
};

function clampPct(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function difficultyWeight(diff?: string | null): number {
  switch ((diff || "").toUpperCase()) {
    case "EXPERT":
      return 1;
    case "HARD":
      return 0.8;
    case "MEDIUM":
      return 0.55;
    case "EASY":
      return 0.3;
    default:
      return 0.5;
  }
}

function toPoint(cx: number, cy: number, radius: number, idx: number, n: number): [number, number] {
  const angle = -Math.PI / 2 + (idx * (Math.PI * 2)) / n;
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}

function polygonPoints(scores: number[], cx: number, cy: number, rMax: number): string {
  return scores
    .map((s, i) => {
      const [x, y] = toPoint(cx, cy, rMax * (clampPct(s) / 100), i, scores.length);
      return `${x},${y}`;
    })
    .join(" ");
}

export function StudentPerformanceSpiderChart({
  insights,
  questions,
}: {
  insights: StudentPerformanceInsights;
  questions: StudentQuestionReview[];
}) {
  const axes = useMemo<AxisScore[]>(() => {
    const attempted = Math.max(1, questions.length);
    const avgTime = insights.avg_time_seconds ?? 0;

    const timed = questions.filter((q) => q.time_spent_seconds != null && q.time_spent_seconds >= 0);
    const faster = timed.filter((q) => (q.your_time_faster_than_peer_percent ?? 0) >= 50).length;
    const timeStrength = timed.length > 0 ? clampPct((faster / timed.length) * 100) : clampPct(100 - Math.min(100, avgTime));
    const timeWeakness = clampPct(
      ((insights.wasted_time_questions + insights.skip_candidate_questions) / attempted) * 100
    );

    let totalW = 0;
    let solvedW = 0;
    for (const q of questions) {
      const w = difficultyWeight(q.difficulty_when_served);
      totalW += w;
      if (q.is_correct) solvedW += w;
    }
    const diffStrength = totalW > 0 ? clampPct((solvedW / totalW) * 100) : 0;
    const hardWrong = questions.filter(
      (q) =>
        !q.is_correct &&
        ["HARD", "EXPERT"].includes((q.difficulty_when_served || "").toUpperCase())
    ).length;
    const diffWeakness = clampPct((hardWrong / attempted) * 100);

    const knowledgeStrength = clampPct(insights.accuracy_percent);
    const knowledgeWeakness = clampPct((insights.missed_opportunity_questions / attempted) * 100);

    return [
      { label: "Time", strength: timeStrength, weakness: timeWeakness },
      { label: "Difficulty", strength: diffStrength, weakness: diffWeakness },
      { label: "Knowledge", strength: knowledgeStrength, weakness: knowledgeWeakness },
    ];
  }, [insights, questions]);

  const cx = 165;
  const cy = 145;
  const rMax = 96;
  const rings = [0.25, 0.5, 0.75, 1];

  const strengthPts = polygonPoints(axes.map((a) => a.strength), cx, cy, rMax);
  const weaknessPts = polygonPoints(axes.map((a) => a.weakness), cx, cy, rMax);

  return (
    <div
      style={{
        marginTop: "1rem",
        border: "1px solid #dbeafe",
        borderRadius: 12,
        background:
          "radial-gradient(120% 100% at 20% 0%, rgba(224,242,254,0.65) 0%, rgba(255,255,255,1) 70%)",
        padding: "0.9rem 1rem",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "0.82rem", letterSpacing: "0.04em", textTransform: "uppercase", color: "#0f4c81" }}>
        3D Spiderchart — live strengths vs weaknesses
      </div>
      <svg width={330} height={285} role="img" aria-label="Student performance spider chart">
        <defs>
          <filter id="spiderShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="rgba(15,23,42,0.22)" />
          </filter>
        </defs>
        {rings.map((ring) => {
          const pts = polygonPoints(axes.map(() => ring * 100), cx, cy, rMax);
          return <polygon key={ring} points={pts} fill="none" stroke="#dbeafe" strokeWidth={1} />;
        })}
        {axes.map((a, i) => {
          const [x, y] = toPoint(cx, cy, rMax + 18, i, axes.length);
          const [lx, ly] = toPoint(cx, cy, rMax, i, axes.length);
          return (
            <g key={a.label}>
              <line x1={cx} y1={cy} x2={lx} y2={ly} stroke="#bfdbfe" strokeWidth={1.2} />
              <text x={x} y={y} textAnchor="middle" fontSize="12" fill="#334155" fontWeight={700}>
                {a.label}
              </text>
            </g>
          );
        })}

        <polygon points={weaknessPts} fill="rgba(239,68,68,0.25)" stroke="#dc2626" strokeWidth={2} filter="url(#spiderShadow)" />
        <polygon points={strengthPts} fill="rgba(34,197,94,0.28)" stroke="#16a34a" strokeWidth={2.2} filter="url(#spiderShadow)" />
      </svg>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.8rem", color: "#475569", marginTop: "-0.4rem" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(34,197,94,0.55)", border: "1px solid #16a34a" }} />
          Strength
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "rgba(239,68,68,0.45)", border: "1px solid #dc2626" }} />
          Weakness
        </span>
      </div>
    </div>
  );
}
