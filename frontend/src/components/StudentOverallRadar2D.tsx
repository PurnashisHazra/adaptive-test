import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { StudentOverallAnalytics, StudentOverallAttemptPoint, StudentOverallDimensionKey } from "../api/types";

const RADAR_ANGLES = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI) / 3, -Math.PI / 2 + (4 * Math.PI) / 3] as const;

function dimStrength(data: StudentOverallAnalytics, key: StudentOverallDimensionKey): number {
  const d = data.dimensions.find((x) => x.key === key);
  return d?.overall_strength ?? 0;
}

function triPoints(cx: number, cy: number, maxR: number, knowledge: number, difficulty: number, time: number): string {
  const vals = [knowledge, difficulty, time];
  return RADAR_ANGLES.map((ang, i) => {
    const r = (maxR * Math.max(0, Math.min(100, vals[i]))) / 100;
    const x = cx + r * Math.cos(ang);
    const y = cy + r * Math.sin(ang);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

/** Centroid of the three axis points for an attempt — good single marker per session. */
function attemptCentroid(ap: StudentOverallAttemptPoint, cx: number, cy: number, maxR: number): { x: number; y: number } {
  const vals = [ap.knowledge_strength, ap.difficulty_strength, ap.time_strength];
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < 3; i++) {
    const r = (maxR * Math.max(0, Math.min(100, vals[i]))) / 100;
    sx += cx + r * Math.cos(RADAR_ANGLES[i]);
    sy += cy + r * Math.sin(RADAR_ANGLES[i]);
  }
  return { x: sx / 3, y: sy / 3 };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function RadarChartSvg({
  data,
  w,
  h,
  maxR,
  attemptDotR,
  clipId,
  transform,
  footerCaption,
  onAttemptClick,
}: {
  data: StudentOverallAnalytics;
  w: number;
  h: number;
  maxR: number;
  attemptDotR: number;
  clipId: string;
  transform: string;
  footerCaption: string;
  onAttemptClick?: (attemptId: string) => void;
}) {
  const cx = w / 2;
  const cy = h / 2 + 8;
  const k = dimStrength(data, "knowledge");
  const d = dimStrength(data, "difficulty");
  const t = dimStrength(data, "time");
  const dk = triPoints(cx, cy, maxR, data.desired_state.knowledge_strength, data.desired_state.difficulty_strength, data.desired_state.time_strength);
  const pk = triPoints(cx, cy, maxR, k, d, t);
  const grid50 = triPoints(cx, cy, maxR * 0.5, 100, 100, 100);
  const grid100 = triPoints(cx, cy, maxR, 100, 100, 100);

  const labels = [
    { text: "Knowledge", ang: RADAR_ANGLES[0], key: "k" },
    { text: "Difficulty", ang: RADAR_ANGLES[1], key: "d" },
    { text: "Time", ang: RADAR_ANGLES[2], key: "t" },
  ];
  const lr = maxR + 36;
  const labelPos = labels.map(({ text, ang, key }) => ({
    text,
    x: cx + lr * Math.cos(ang),
    y: cy + lr * Math.sin(ang),
    key,
  }));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ display: "block", touchAction: "none" }} role="img" aria-label="Performance radar">
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g transform={transform}>
          <polygon points={grid100} fill="none" stroke="var(--border)" strokeWidth={1} />
          <polygon points={grid50} fill="none" stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4" />
          <polygon points={dk} fill="rgba(14,165,233,0.06)" stroke="var(--primary)" strokeWidth={1.75} strokeDasharray="6 4" />
          <polygon points={pk} fill="rgba(2,132,199,0.18)" stroke="var(--primary-dark)" strokeWidth={2.25} strokeLinejoin="round" />
          {data.attempt_points.map((ap) => {
            const p = attemptCentroid(ap, cx, cy, maxR);
            const tip = `${ap.label}\nKnowledge ${ap.knowledge_strength.toFixed(1)}%\nDifficulty ${ap.difficulty_strength.toFixed(1)}%\nTime ${ap.time_strength.toFixed(1)}%\nClick for questions, times, and correct/wrong.`;
            const clickable = Boolean(onAttemptClick);
            return (
              <circle
                key={ap.attempt_id}
                cx={p.x}
                cy={p.y}
                r={clickable ? attemptDotR + 2 : attemptDotR}
                fill="var(--accent)"
                fillOpacity={0.85}
                stroke="#fff"
                strokeWidth={1}
                style={{ cursor: clickable ? "pointer" : undefined }}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={
                  clickable && onAttemptClick
                    ? (e) => {
                        e.stopPropagation();
                        onAttemptClick(ap.attempt_id);
                      }
                    : undefined
                }
                onKeyDown={
                  clickable && onAttemptClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onAttemptClick(ap.attempt_id);
                        }
                      }
                    : undefined
                }
              >
                <title>{tip}</title>
              </circle>
            );
          })}
          {labelPos.map(({ text, x, y, key }) => (
            <text key={key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(11, w * 0.028)} fontWeight={600} fill="var(--text)">
              {text}
            </text>
          ))}
          <text x={cx} y={h - 8} textAnchor="middle" fontSize={Math.max(10, w * 0.025)} fill="var(--muted)">
            {footerCaption}
          </text>
        </g>
      </g>
    </svg>
  );
}

export function StudentOverallRadar2D({
  data,
  loading,
  onAttemptPointClick,
  printMode = false,
}: {
  data: StudentOverallAnalytics | null;
  loading?: boolean;
  onAttemptPointClick?: (attemptId: string) => void;
  /** Hide expand modal controls (PDF / print export). */
  printMode?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const clipCompact = `radar-clip-${uid}-c`;
  const clipModal = `radar-clip-${uid}-m`;

  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number } | null>(null);
  const modalWrapRef = useRef<HTMLDivElement>(null);

  const modalW = 640;
  const modalH = 560;
  const modalMaxR = 210;
  const modalCx = modalW / 2;
  const modalCy = modalH / 2 + 8;

  useEffect(() => {
    if (!expanded) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [expanded, data?.attempts_considered]);

  useEffect(() => {
    if (!expanded) return;
    const el = modalWrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.09 : 0.91), 0.5, 6));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const tf = useCallback(() => {
    return `translate(${pan.x} ${pan.y}) translate(${modalCx} ${modalCy}) scale(${zoom}) translate(${-modalCx} ${-modalCy})`;
  }, [pan.x, pan.y, zoom, modalCx, modalCy]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!expanded) return;
    modalWrapRef.current?.setPointerCapture(e.pointerId);
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!expanded || !drag.current?.active) return;
    const d = drag.current;
    setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current?.active) {
      try {
        modalWrapRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    drag.current = null;
  };

  if (loading && !data) {
    return (
      <div className="card" style={{ marginTop: "1rem", padding: "1.25rem" }}>
        <p style={{ margin: 0, color: "var(--muted)" }}>Updating performance profile…</p>
      </div>
    );
  }

  if (!data) return null;

  const compactW = 360;
  const compactH = 320;
  const compactMaxR = 118;

  return (
    <>
      <div className="card" style={{ marginTop: "1rem", padding: "1rem 1rem 1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.35rem" }}>Knowledge · Difficulty · Time</h3>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)", maxWidth: 520 }}>
              Corners are 0–100% strength (higher is better). Solid = your blend; dashed = target. Coloured dots are individual attempts — hover
              for scores; click a dot to see each question, time spent, and correct/wrong. Expand to zoom and pan.
            </p>
          </div>
          {printMode ? null : (
            <button type="button" className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={() => setExpanded(true)}>
              Expand radar
            </button>
          )}
        </div>
        <div style={{ maxWidth: 440, margin: "0.75rem auto 0" }}>
          <RadarChartSvg
            data={data}
            w={compactW}
            h={compactH}
            maxR={compactMaxR}
            attemptDotR={5}
            clipId={clipCompact}
            transform="translate(0 0)"
            footerCaption={`${data.attempt_points.length} attempt marker${data.attempt_points.length === 1 ? "" : "s"} · expand to zoom & pan`}
            onAttemptClick={onAttemptPointClick}
          />
        </div>
      </div>

      {expanded ? (
        <div
          className="radar-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded performance radar"
          onClick={() => setExpanded(false)}
        >
          <div className="radar-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Performance radar — attempts</h3>
              <button type="button" className="btn btn-ghost" onClick={() => setExpanded(false)}>
                Close
              </button>
            </div>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.82rem", color: "var(--muted)" }}>
              Wheel or trackpad to zoom; drag to pan. Each dot is one attempt (centre of its time / difficulty / knowledge triangle).
            </p>
            <div
              ref={modalWrapRef}
              style={{ height: "min(72vh, 620px)", cursor: expanded ? "grab" : undefined }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              <RadarChartSvg
                data={data}
                w={modalW}
                h={modalH}
                maxR={modalMaxR}
                attemptDotR={8}
                clipId={clipModal}
                transform={tf()}
                footerCaption={`${data.attempt_points.length} attempt marker${data.attempt_points.length === 1 ? "" : "s"} · drag to pan · wheel to zoom`}
                onAttemptClick={onAttemptPointClick}
              />
            </div>
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
              Aggregate: {data.attempts_considered} attempt{data.attempts_considered === 1 ? "" : "s"} · {data.questions_considered} answer
              {data.questions_considered === 1 ? "" : "s"} (filtered)
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function StudentOverallStrategyPanel({ data }: { data: StudentOverallAnalytics | null }) {
  if (!data?.strategy_to_desired_state?.length) return null;

  return (
    <div className="card" style={{ marginTop: "1rem", padding: "1.25rem" }}>
      <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Strategy to raise your score</h3>
      <p style={{ margin: "0 0 0.85rem", fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
        Prioritise the gaps below in order. Each action is tuned to your current time management, difficulty handling, and knowledge signals.
      </p>
      <ol style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.65, fontSize: "0.92rem" }}>
        {data.strategy_to_desired_state.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </div>
  );
}
