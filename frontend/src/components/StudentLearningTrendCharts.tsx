import { useCallback, useMemo, useState } from "react";
import type { StudentLearningTrendsResponse, StudentSessionFilters, StudentTrendPoint } from "../api/types";
import { StudentAttemptFilterBar } from "./StudentAttemptFilterBar";

type SeriesPoint = StudentTrendPoint & {
  cumulative_accuracy_percent: number;
  index: number;
};

const defaultFilters = (): StudentSessionFilters => ({ subject: "", topic: "", exam: "" });

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function linePoints(
  xs: number[],
  ys: number[],
  opts: { w: number; h: number; pl: number; pr: number; pt: number; pb: number; yMin: number; yMax: number },
): string {
  const { w, h, pl, pr, pt, pb, yMin, yMax } = opts;
  const innerW = w - pl - pr;
  const innerH = h - pt - pb;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const xr = maxX - minX || 1;
  const yr = yMax - yMin || 1;
  return xs
    .map((x, i) => {
      const px = pl + ((x - minX) / xr) * innerW;
      const py = pt + innerH - ((ys[i] - yMin) / yr) * innerH;
      return `${px.toFixed(2)},${py.toFixed(2)}`;
    })
    .join(" ");
}

function MiniLineChart({
  title,
  subtitle,
  xs,
  ys,
  yMin,
  yMax,
  yTickFormat,
  emptyMessage,
  attemptIds,
  onAttemptClick,
}: {
  title: string;
  subtitle?: string;
  xs: number[];
  ys: number[];
  yMin: number;
  yMax: number;
  yTickFormat: (n: number) => string;
  emptyMessage: string;
  attemptIds?: string[];
  onAttemptClick?: (attemptId: string) => void;
}) {
  const w = 420;
  const h = 200;
  const pl = 44;
  const pr = 12;
  const pt = 16;
  const pb = 32;
  const has = xs.length > 0 && ys.length === xs.length;
  const lo = yMin;
  const hi = yMax <= yMin ? yMin + 1e-6 : yMax;

  const pts = has ? linePoints(xs, ys, { w, h, pl, pr, pt, pb, yMin: lo, yMax: hi }) : "";

  return (
    <div className="card review-chart-card">
      <h3 style={{ fontSize: "1rem", marginBottom: "0.2rem" }}>{title}</h3>
      {subtitle ? (
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>{subtitle}</p>
      ) : (
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>Across completed tests (newest on the right).</p>
      )}
      <div className={has ? "review-chart-card__plot review-chart-card__plot--filled" : "review-chart-card__plot"}>
        {!has ? (
          <p className="review-chart-card__empty">{emptyMessage}</p>
        ) : (
          <svg
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            height={h}
            style={{ display: "block", maxWidth: "100%" }}
            role="img"
            aria-label={title}
          >
            <rect x={0} y={0} width={w} height={h} fill="transparent" />
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const innerH = h - pt - pb;
              const y = pt + innerH * (1 - t);
              const gv = lo + (hi - lo) * t;
              return (
                <g key={t}>
                  <line x1={pl} y1={y} x2={w - pr} y2={y} stroke="var(--border)" strokeWidth={1} />
                  <text x={4} y={y + 4} fontSize={11} fill="var(--muted)">
                    {yTickFormat(gv)}
                  </text>
                </g>
              );
            })}
            <polyline fill="none" stroke="var(--primary-dark)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={pts} />
            {xs.map((x, i) => {
              const innerW = w - pl - pr;
              const innerH = h - pt - pb;
              const minX = Math.min(...xs);
              const maxX = Math.max(...xs);
              const xr = maxX - minX || 1;
              const yr = hi - lo || 1;
              const px = pl + ((x - minX) / xr) * innerW;
              const py = pt + innerH - ((ys[i] - lo) / yr) * innerH;
              const attemptId = attemptIds?.[i];
              const clickable = Boolean(attemptId && onAttemptClick);
              return (
                <circle
                  key={`${i}-${attemptId ?? "x"}`}
                  cx={px}
                  cy={py}
                  r={clickable ? 7 : 4}
                  fill="var(--bg-card)"
                  stroke="var(--primary-dark)"
                  strokeWidth={clickable ? 2.5 : 2}
                  style={{ cursor: clickable ? "pointer" : undefined }}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={
                    clickable && attemptId && onAttemptClick
                      ? (e) => {
                          e.stopPropagation();
                          onAttemptClick(attemptId);
                        }
                      : undefined
                  }
                  onKeyDown={
                    clickable && attemptId && onAttemptClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onAttemptClick(attemptId);
                          }
                        }
                      : undefined
                  }
                />
              );
            })}
            <text x={pl} y={h - 6} fontSize={11} fill="var(--muted)">
              Test sequence (oldest → newest)
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}

export function StudentLearningTrendCharts({
  data,
  filters: controlledFilters,
  onFiltersChange,
  hideFilterRow = false,
  omitSectionChrome = false,
  onAttemptPointClick,
}: {
  data: StudentLearningTrendsResponse | null;
  filters?: StudentSessionFilters;
  onFiltersChange?: (patch: Partial<StudentSessionFilters>) => void;
  hideFilterRow?: boolean;
  /** When true, only the chart grid (no outer section, heading, or intro). Use inside a parent panel. */
  omitSectionChrome?: boolean;
  onAttemptPointClick?: (attemptId: string) => void;
}) {
  const [internalFilters, setInternalFilters] = useState<StudentSessionFilters>(defaultFilters);
  const isControlled = controlledFilters !== undefined;
  const active = isControlled ? controlledFilters : internalFilters;

  const patchInternal = useCallback((patch: Partial<StudentSessionFilters>) => {
    setInternalFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyPatch = isControlled ? onFiltersChange ?? (() => {}) : patchInternal;

  const chartSeries = useMemo(() => {
    if (!data?.points.length) return [] as SeriesPoint[];
    const { subject, topic, exam } = active;
    let rows = data.points.filter((p) => {
      if (subject && (p.subject ?? "") !== subject) return false;
      if (topic && (p.topic ?? "") !== topic) return false;
      if (exam && (p.exam_tag ?? "") !== exam) return false;
      return true;
    });
    rows = [...rows].sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime() || a.attempt_id.localeCompare(b.attempt_id),
    );
    let runC = 0;
    let runN = 0;
    return rows.map((p, i) => {
      runC += p.score;
      runN += p.questions_answered;
      const cumulative_accuracy_percent = runN > 0 ? (runC / runN) * 100 : 0;
      return { ...p, cumulative_accuracy_percent, index: i + 1 };
    });
  }, [data, active]);

  if (!data) return null;

  const xs = chartSeries.map((p) => p.index);
  const accYs = chartSeries.map((p) => clamp(p.accuracy_percent, 0, 100));
  const cumYs = chartSeries.map((p) => clamp(p.cumulative_accuracy_percent, 0, 100));
  const timeYs = chartSeries.map((p) => Math.max(0, p.total_time_seconds));
  const tMax = timeYs.length ? Math.max(...timeYs, 60) : 60;

  const emptyMsg = "No attempts match the current filters.";
  const attemptIds = chartSeries.map((p) => p.attempt_id);

  const chartsGrid = (
    <div className="review-charts-grid">
      <MiniLineChart
        title="Learning curve"
        subtitle={
          onAttemptPointClick
            ? "Cumulative accuracy over questions answered, in test order. Click a point to see each question, time, and correct/wrong."
            : "Cumulative accuracy over questions answered, in test order."
        }
        xs={xs}
        ys={cumYs}
        yMin={0}
        yMax={100}
        yTickFormat={(n) => `${Math.round(n)}%`}
        emptyMessage={emptyMsg}
        attemptIds={attemptIds}
        onAttemptClick={onAttemptPointClick}
      />
      <MiniLineChart
        title="Accuracy through tests"
        subtitle={
          onAttemptPointClick
            ? "Per-test accuracy (this test only). Click a point to inspect that attempt."
            : "Per-test accuracy (this test only)."
        }
        xs={xs}
        ys={accYs}
        yMin={0}
        yMax={100}
        yTickFormat={(n) => `${Math.round(n)}%`}
        emptyMessage={emptyMsg}
        attemptIds={attemptIds}
        onAttemptClick={onAttemptPointClick}
      />
      <MiniLineChart
        title="Time management through tests"
        subtitle={
          onAttemptPointClick
            ? "Total time on recorded answers per test. Click a point to inspect that attempt."
            : "Total time on recorded answers per test."
        }
        xs={xs}
        ys={timeYs}
        yMin={0}
        yMax={tMax}
        yTickFormat={(n) => {
          if (n >= 3600) return `${(n / 3600).toFixed(1)}h`;
          if (n >= 120) return `${Math.round(n / 60)}m`;
          return `${Math.round(n)}s`;
        }}
        emptyMessage={emptyMsg}
        attemptIds={attemptIds}
        onAttemptClick={onAttemptPointClick}
      />
    </div>
  );

  if (omitSectionChrome) {
    return chartsGrid;
  }

  return (
    <section className="review-progress-section" aria-labelledby="review-progress-heading">
      <h2 id="review-progress-heading" style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
        Progress across tests
      </h2>
      <p style={{ color: "var(--muted)", maxWidth: 640, marginTop: 0, marginBottom: "1rem", fontSize: "0.9rem" }}>
        Subject, topic, and exam options are taken from your completed standalone tests and paper sections; charts use the same
        filters.
      </p>

      {!hideFilterRow ? <StudentAttemptFilterBar data={data} value={active} onChange={applyPatch} /> : null}

      {chartsGrid}
    </section>
  );
}
