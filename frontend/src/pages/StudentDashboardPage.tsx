import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getMyAccount, getMyLearningTrends, getMyOverallAnalytics } from "../api/client";
import { PerformanceAnalyticsGate } from "../components/PerformanceAnalyticsGate";
import { hasValidMobile } from "../lib/phone";
import type { StudentLearningTrendsResponse, StudentOverallAnalytics, StudentSessionFilters } from "../api/types";
import { StudentAttemptFilterBar } from "../components/StudentAttemptFilterBar";
import { AttemptDrilldownModal } from "../components/AttemptDrilldownModal";
import { StudentLearningTrendCharts } from "../components/StudentLearningTrendCharts";
import { StudentOverallRadar2D, StudentOverallStrategyPanel } from "../components/StudentOverallRadar2D";
import { StudentPastAttemptsStrategyBlock } from "../components/StudentPastAttemptsStrategyBlock";
import { AppPage } from "../components/AppPage";

const emptyFilters = (): StudentSessionFilters => ({ subject: "", topic: "", exam: "" });

export function StudentDashboardPage() {
  const [trends, setTrends] = useState<StudentLearningTrendsResponse | null>(null);
  const [filters, setFilters] = useState<StudentSessionFilters>(emptyFilters);
  const [overall, setOverall] = useState<StudentOverallAnalytics | null>(null);
  const [overallLoading, setOverallLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [drillAttemptId, setDrillAttemptId] = useState<string | null>(null);
  const [accountMobile, setAccountMobile] = useState<string | null | undefined>(undefined);

  const analyticsUnlocked = hasValidMobile(accountMobile);

  const patchFilters = useCallback((patch: Partial<StudentSessionFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadAccountMobile = useCallback(() => {
    getMyAccount()
      .then((a) => setAccountMobile(a.mobile ?? null))
      .catch(() => setAccountMobile(null));
  }, []);

  useEffect(() => {
    loadAccountMobile();
    getMyLearningTrends()
      .then(setTrends)
      .catch(() => toast.error("Could not load your progress"))
      .finally(() => setPageLoading(false));
  }, [loadAccountMobile]);

  useEffect(() => {
    const onFocus = () => loadAccountMobile();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadAccountMobile]);

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
      <AppPage title="Performance" lead="Loading your analytics…">
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </AppPage>
    );
  }

  return (
    <AppPage
      title="Performance"
      lead="Learning curves and the radar use the same subject, topic, and exam filters — only attempts that match are included."
    >
      <AttemptDrilldownModal attemptId={drillAttemptId} open={drillAttemptId != null} onClose={() => setDrillAttemptId(null)} />
      <nav className="app-page-nav">
        <Link to="/" className="app-page-nav__link">
          ← Challenges
        </Link>
        <Link to="/take-test" className="btn btn-primary" style={{ textDecoration: "none" }}>
          Start adaptive test
        </Link>
        <Link to="/review" className="app-page-nav__link">
          Paper review
        </Link>
        <Link to="/history" className="app-page-nav__link">
          My results
        </Link>
      </nav>

      {trends && hasTrendPoints ? (
        <section className="review-progress-section" aria-label="Analytics and charts">
          <h2 className="app-page-section__title">Learning curves</h2>
          <p className="app-page-section__lead">
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
          <StudentOverallStrategyPanel data={overall} analyticsUnlocked={analyticsUnlocked} />
          <PerformanceAnalyticsGate unlocked={analyticsUnlocked} minHeight={280}>
            <StudentPastAttemptsStrategyBlock trends={trends} filters={filters} overall={overall} />
          </PerformanceAnalyticsGate>
        </section>
      ) : (
        <div className="card">
          <p style={{ margin: 0, color: "var(--muted)" }}>
            No completed attempts with answers yet. Take a test to see learning curves and your performance radar here.
          </p>
        </div>
      )}
    </AppPage>
  );
}
