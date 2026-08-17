import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getSuperAdminMetrics } from "../../api/client";
import type { SuperAdminMetrics, SuperAdminPeriodCounts } from "../../api/types";
import { formatDateTimeIST } from "../../lib/istTime";

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function num(n: number) {
  return n.toLocaleString("en-IN");
}

type PeriodRow = { label: string; hint?: string; counts: SuperAdminPeriodCounts };

function PeriodBlock({
  rows,
  formatValue = num,
}: {
  rows: PeriodRow[];
  formatValue?: (n: number) => string;
}) {
  return (
    <>
      <div className="sa-period-cards">
        {rows.map((row) => (
          <article className="sa-period-card" key={row.label}>
            <h3>{row.label}</h3>
            {row.hint ? <p>{row.hint}</p> : null}
            <dl className="sa-period-grid">
              <div>
                <dt>24 hours</dt>
                <dd>{formatValue(row.counts.last_day)}</dd>
              </div>
              <div>
                <dt>7 days</dt>
                <dd>{formatValue(row.counts.last_week)}</dd>
              </div>
              <div>
                <dt>30 days</dt>
                <dd>{formatValue(row.counts.last_month)}</dd>
              </div>
              <div>
                <dt>All time</dt>
                <dd>{formatValue(row.counts.all_time)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <div className="sa-period-table-wrap">
        <table className="super-admin-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Last 24 hours</th>
              <th>Last 7 days</th>
              <th>Last 30 days</th>
              <th>All time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>
                  <div className="sa-metrics-row-label">{row.label}</div>
                  {row.hint ? <div className="sa-metrics-row-hint">{row.hint}</div> : null}
                </td>
                <td>{formatValue(row.counts.last_day)}</td>
                <td>{formatValue(row.counts.last_week)}</td>
                <td>{formatValue(row.counts.last_month)}</td>
                <td>{formatValue(row.counts.all_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CatalogCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`sa-catalog-card${accent ? " sa-catalog-card--accent" : ""}`}>
      <div className="label">{label}</div>
      <div className="sa-metrics-stat__value">{value}</div>
      {hint ? <div className="sa-metrics-row-hint">{hint}</div> : null}
    </div>
  );
}

export function SuperAdminMetricsPage() {
  const [data, setData] = useState<SuperAdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getSuperAdminMetrics());
    } catch {
      toast.error("Could not load platform metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) {
    return (
      <div className="skeleton sa-skeleton" aria-busy="true">
        Loading metrics…
      </div>
    );
  }

  return (
    <div>
      <div className="sa-toolbar">
        <p className="sa-page-lead" style={{ margin: 0, flex: "1 1 16rem" }}>
          Lookbacks from {formatDateTimeIST(data.generated_at)}. Last day is 24 hours, week is 7 days, month is 30 days.
        </p>
        <button type="button" className="landing-btn-primary" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="sa-kpi-panel">
        <div className="sa-kpi-grid">
          <div className="sa-kpi">
            <span className="sa-kpi__value">{num(data.users.total.all_time)}</span>
            <span className="sa-kpi__label">Users</span>
            <span className="sa-kpi__hint">{num(data.users.students.all_time)} students</span>
          </div>
          <div className="sa-kpi">
            <span className="sa-kpi__value">{inr(data.revenue.total_revenue_inr.all_time)}</span>
            <span className="sa-kpi__label">Revenue</span>
            <span className="sa-kpi__hint">Confirmed UPI</span>
          </div>
          <div className="sa-kpi">
            <span className="sa-kpi__value">{num(data.revenue.pending_payments)}</span>
            <span className="sa-kpi__label">Pending</span>
            <span className="sa-kpi__hint">Mentorship + unlocks</span>
          </div>
          <div className="sa-kpi">
            <span className="sa-kpi__value">{num(data.users.total.last_day)}</span>
            <span className="sa-kpi__label">New (24h)</span>
            <span className="sa-kpi__hint">{num(data.users.total.last_week)} this week</span>
          </div>
        </div>
        <div className="sa-kpi-band">
          <p>Confirmed UPI only. Mentorship and paper unlocks are ₹100 each.</p>
        </div>
      </div>

      <section className="sa-section">
        <h2>Users</h2>
        <PeriodBlock
          rows={[
            { label: "All new accounts", counts: data.users.total },
            { label: "Students", counts: data.users.students },
            { label: "Admins", counts: data.users.admins },
            { label: "Super admins", counts: data.users.super_admins },
          ]}
        />
      </section>

      <section className="sa-section">
        <h2>Attempts</h2>
        <PeriodBlock
          rows={[
            {
              label: "Adaptive tests started",
              hint: "Standalone practice tests, not papers or challenges",
              counts: data.attempts.adaptive_tests,
            },
            { label: "Adaptive tests completed", counts: data.attempts.adaptive_tests_completed },
            { label: "Paper attempts started", counts: data.attempts.paper_attempts },
            { label: "Paper attempts completed", counts: data.attempts.paper_attempts_completed },
            { label: "Challenge attempts started", counts: data.attempts.challenge_attempts },
            { label: "Challenge attempts completed", counts: data.attempts.challenge_attempts_completed },
          ]}
        />
      </section>

      <section className="sa-section">
        <h2>Revenue & payments</h2>
        <p className="sa-note">
          Mentorship sessions and paper unlocks are ₹100 each. Revenue counts only admin-confirmed payments.
        </p>
        <PeriodBlock
          formatValue={inr}
          rows={[
            { label: "Total revenue", counts: data.revenue.total_revenue_inr },
            { label: "Mentorship revenue", counts: data.revenue.mentorship.revenue_inr },
            { label: "Paper unlock revenue", counts: data.revenue.paper_unlocks.revenue_inr },
          ]}
        />
        <div className="sa-metrics-table-gap">
          <PeriodBlock
            rows={[
              { label: "Mentorship payments confirmed", counts: data.revenue.mentorship.confirmed },
              { label: "Mentorship payments rejected", counts: data.revenue.mentorship.rejected },
              { label: "Paper unlocks confirmed", counts: data.revenue.paper_unlocks.confirmed },
              { label: "Paper unlocks rejected", counts: data.revenue.paper_unlocks.rejected },
            ]}
          />
        </div>
        <div className="sa-catalog-grid" style={{ marginTop: "0.85rem" }}>
          <CatalogCard label="Mentorship pending" value={num(data.revenue.mentorship.pending)} />
          <CatalogCard label="Paper unlocks pending" value={num(data.revenue.paper_unlocks.pending)} />
          <CatalogCard
            accent
            label="Revenue (30d)"
            value={inr(data.revenue.total_revenue_inr.last_month)}
            hint="Confirmed UPI"
          />
        </div>
      </section>

      <section className="sa-section">
        <h2>Leads</h2>
        <PeriodBlock
          rows={[
            { label: "Consultation requests", counts: data.leads.consultations },
            { label: "Leader connect requests", counts: data.leads.leader_connect },
          ]}
        />
      </section>

      <section className="sa-section">
        <h2>Catalog</h2>
        <div className="sa-catalog-grid">
          <CatalogCard label="Questions" value={num(data.catalog.questions)} />
          <CatalogCard label="Question papers" value={num(data.catalog.papers)} />
          <CatalogCard label="Challenges" value={num(data.catalog.challenges)} />
        </div>
      </section>
    </div>
  );
}
