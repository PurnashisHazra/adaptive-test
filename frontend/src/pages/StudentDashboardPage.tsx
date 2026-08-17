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
import { PageEmpty, PageLoading } from "../components/AppPageStates";

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
  const filteredCount = useMemo(() => {
    if (!trends?.points.length) return 0;
    return trends.points.filter((p) => {
      if (filters.subject && (p.subject ?? "") !== filters.subject) return false;
      if (filters.topic && (p.topic ?? "") !== filters.topic) return false;
      if (filters.exam && (p.exam_tag ?? "") !== filters.exam) return false;
      return true;
    }).length;
  }, [trends, filters]);

  if (pageLoading) {
    return (
      <AppPage panel showSubNav title="Performance" lead="Loading your analytics…">
        <PageLoading label="Loading performance data…" />
      </AppPage>
    );
  }

  return (
    <AppPage
      panel
      showSubNav
      title="Performance"
      lead="Learning curves and the performance radar use the same subject, topic, and exam filters — only matching attempts are included."
      actions={
        <Link to="/take-test" className="btn btn-primary" style={{ textDecoration: "none" }}>
          Start adaptive test
        </Link>
      }
    >
      <AttemptDrilldownModal attemptId={drillAttemptId} open={drillAttemptId != null} onClose={() => setDrillAttemptId(null)} />

      {trends && hasTrendPoints ? (
        <>
          <div className="app-stat-grid">
            <div className="card app-stat-card">
              <div className="label">Sessions tracked</div>
              <div className="app-stat-card__value">{trends.points.length}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Matching filters</div>
              <div className="app-stat-card__value">{filteredCount}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Subjects</div>
              <div className="app-stat-card__value">{trends.filter_options.subjects.length || "—"}</div>
            </div>
            <div className="card app-stat-card">
              <div className="label">Strategy insights</div>
              <div className="app-stat-card__value">{analyticsUnlocked ? "Unlocked" : "Add mobile"}</div>
            </div>
          </div>

          <section className="student-content-section" aria-label="Analytics and charts">
            <h2 className="app-page-section__title">Learning curves</h2>
            <p className="app-page-section__lead">
              Standalone tests and paper sections (including ended early), consistent with Analytics review.
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
        </>
      ) : (
        <PageEmpty
          title="No performance data yet"
          action={
            <Link to="/take-test" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Take a test
            </Link>
          }
        >
          Complete a standalone test or paper section to see learning curves and your performance radar here.
        </PageEmpty>
      )}
    </AppPage>
  );
}
