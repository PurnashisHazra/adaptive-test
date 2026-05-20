import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getMyLearningTrends, getMyOverallAnalytics } from "../api/client";
import type { StudentLearningTrendsResponse, StudentOverallAnalytics, StudentSessionFilters } from "../api/types";
import { StudentAttemptFilterBar } from "../components/StudentAttemptFilterBar";
import { AttemptDrilldownModal } from "../components/AttemptDrilldownModal";
import { StudentLearningTrendCharts } from "../components/StudentLearningTrendCharts";
import { StudentOverallRadar2D, StudentOverallStrategyPanel } from "../components/StudentOverallRadar2D";
import { StudentPastAttemptsStrategyBlock } from "../components/StudentPastAttemptsStrategyBlock";

const emptyFilters = (): StudentSessionFilters => ({ subject: "", topic: "", exam: "" });

export function StudentDashboardPage() {
  const [trends, setTrends] = useState<StudentLearningTrendsResponse | null>(null);
  const [filters, setFilters] = useState<StudentSessionFilters>(emptyFilters);
  const [overall, setOverall] = useState<StudentOverallAnalytics | null>(null);
  const [overallLoading, setOverallLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [drillAttemptId, setDrillAttemptId] = useState<string | null>(null);

  const patchFilters = useCallback((patch: Partial<StudentSessionFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    getMyLearningTrends()
      .then(setTrends)
      .catch(() => toast.error("Could not load your progress"))
      .finally(() => setPageLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setOverallLoading(true);
      getMyOverallAnalytics({
        subject: filters.subject.trim() || undefined,
        topic: filters.topic.trim() || undefined,
        exam_tag: filters.exam.trim() || undefined,
      })
        .then((o) => {
          if (!cancelled) setOverall(o);
        })
        .catch(() => {
          if (!cancelled) toast.error("Could not load performance profile");
        })
        .finally(() => {
          if (!cancelled) setOverallLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [filters.subject, filters.topic, filters.exam]);

  const hasTrendPoints = useMemo(() => Boolean(trends?.points.length), [trends]);

  if (pageLoading) {
    return (
      <div className="page">
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <AttemptDrilldownModal attemptId={drillAttemptId} open={drillAttemptId != null} onClose={() => setDrillAttemptId(null)} />
      <h1>Performance</h1>
      <p style={{ color: "var(--muted)", maxWidth: 640 }}>
        Learning curves and the radar use the same subject, topic, and exam filters — only attempts that match are included.
      </p>
      <p style={{ marginTop: "0.5rem" }}>
        <Link to="/" style={{ marginRight: "1rem", fontSize: "0.92rem" }}>
          ← Challenges
        </Link>
        <Link to="/take-test" className="btn btn-primary" style={{ display: "inline-block", textDecoration: "none" }}>
          Start adaptive test
        </Link>
        <Link to="/review" style={{ marginLeft: "1rem", fontSize: "0.92rem" }}>
          Paper review
        </Link>
        <Link to="/history" style={{ marginLeft: "1rem", fontSize: "0.92rem" }}>
          My results
        </Link>
      </p>

      {trends && hasTrendPoints ? (
        <section className="review-progress-section" style={{ marginTop: "1.5rem" }} aria-label="Analytics and charts">
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.35rem" }}>Learning curves</h2>
          <p style={{ color: "var(--muted)", maxWidth: 640, marginTop: 0, marginBottom: "1rem", fontSize: "0.9rem" }}>
            Filters match completed standalone tests and paper sections (including ended early), consistent with Paper review analytics.
          </p>
          <StudentAttemptFilterBar data={trends} value={filters} onChange={patchFilters} />
          <StudentLearningTrendCharts
            data={trends}
            filters={filters}
            onFiltersChange={patchFilters}
            hideFilterRow
            omitSectionChrome
            onAttemptPointClick={setDrillAttemptId}
          />
          <StudentOverallRadar2D data={overall} loading={overallLoading} onAttemptPointClick={setDrillAttemptId} />
          <StudentOverallStrategyPanel data={overall} />
          <StudentPastAttemptsStrategyBlock trends={trends} filters={filters} overall={overall} />
        </section>
      ) : (
        <div className="card" style={{ marginTop: "1.5rem" }}>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            No completed attempts with answers yet. Take a test to see learning curves and your performance radar here.
          </p>
        </div>
      )}
    </div>
  );
}
