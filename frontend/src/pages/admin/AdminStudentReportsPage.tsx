import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { getAdminStudentReportPdfBundle, listAdminStudentReportCards } from "../../api/client";
import type { AdminStudentReportCardSummary, AdminStudentReportPdfBundle, LiveCoachStatus, StrategyFollowStatus } from "../../api/types";
import { AdminPanel } from "../../components/AdminPanel";
import { AdminStudentAnalyticsPrintView } from "../../components/AdminStudentAnalyticsPrintView";
import { captureElementToPdf, openStudentReportCardPdfBlob } from "../../lib/generateStudentReportCardPdf";

function strategyLabel(status: StrategyFollowStatus, percent?: number | null): string {
  const pct = percent != null ? ` (${percent.toFixed(0)}%)` : "";
  switch (status) {
    case "on_track":
      return `Following strategy${pct}`;
    case "partial":
      return `Partially following${pct}`;
    case "needs_focus":
      return `Needs focus${pct}`;
    default:
      return "No data yet";
  }
}

function coachLabel(status: LiveCoachStatus, hints: number): string {
  switch (status) {
    case "active":
      return hints > 0 ? `Live coach · ${hints} hint${hints === 1 ? "" : "s"}` : "Live coach active";
    case "plan_ready":
      return "Coach plan saved";
    default:
      return "Not engaged";
  }
}

export function AdminStudentReportsPage() {
  const [cards, setCards] = useState<AdminStudentReportCardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQ, setFilterQ] = useState("");
  const [openingPdf, setOpeningPdf] = useState<string | null>(null);
  const [pdfBundle, setPdfBundle] = useState<AdminStudentReportPdfBundle | null>(null);
  const printRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listAdminStudentReportCards()
      .then(setCards)
      .catch(() => toast.error("Could not load students"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => {
      const name = (c.display_name || c.student_username).toLowerCase();
      return name.includes(q) || c.student_username.toLowerCase().includes(q);
    });
  }, [cards, filterQ]);

  useEffect(() => {
    if (!pdfBundle || !printRootRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const el = printRootRef.current;
        if (!el) return;
        const name = pdfBundle.report.display_name?.trim() || pdfBundle.report.student_username;
        const blob = await captureElementToPdf(el, `Report card — ${name}`);
        if (cancelled) return;
        openStudentReportCardPdfBlob(blob);
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Could not generate PDF");
        }
      } finally {
        if (!cancelled) {
          setPdfBundle(null);
          setOpeningPdf(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfBundle]);

  async function onViewPdf(username: string) {
    setOpeningPdf(username);
    try {
      const bundle = await getAdminStudentReportPdfBundle(username);
      setPdfBundle(bundle);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not load analytics for PDF");
      setOpeningPdf(null);
    }
  }

  const printPortal =
    pdfBundle &&
    createPortal(
      <div className="admin-analytics-print-host" aria-hidden>
        <div ref={printRootRef}>
          <AdminStudentAnalyticsPrintView bundle={pdfBundle} />
        </div>
      </div>,
      document.body,
    );

  return (
    <AdminPanel title="Student report cards">
      {printPortal}
      {openingPdf ? (
        <div className="admin-pdf-generating-overlay" role="status" aria-live="polite">
          <div className="card admin-pdf-generating-overlay__card">
            <p style={{ margin: 0, fontWeight: 600 }}>Building report PDF…</p>
            <p style={{ margin: "0.5rem 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              Rendering charts and analytics (this may take a moment if AI coach data is being generated).
            </p>
          </div>
        </div>
      ) : null}

      <p style={{ color: "var(--muted)", maxWidth: 720, marginTop: 0 }}>
        Students linked to your admin code appear below. View PDF opens the same analytics dashboard students see — learning
        curves, radar, strategy panels, donut charts, and pacing curves.
      </p>

      <div className="card" style={{ marginTop: "1rem", padding: "1rem" }}>
        <label className="label">Filter students</label>
        <input className="input" value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Name or username…" />
      </div>

      {loading ? (
        <p style={{ marginTop: "1.5rem", color: "var(--muted)" }}>Loading students…</p>
      ) : cards.length === 0 ? (
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            No students linked to your admin code yet. Share your admin code so students can register.
          </p>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: "1.25rem" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Student</th>
                <th>Username</th>
                <th>Sessions</th>
                <th>Avg accuracy</th>
                <th>Strategy</th>
                <th>Live coach</th>
                <th style={{ width: 140 }}>Report</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const name = c.display_name?.trim() || c.student_username;
                return (
                  <tr key={c.student_username}>
                    <td>
                      <strong>{name}</strong>
                      {c.blocked ? (
                        <span className="badge" style={{ marginLeft: "0.5rem" }}>
                          Blocked
                        </span>
                      ) : null}
                    </td>
                    <td>{c.student_username}</td>
                    <td>{c.tests_taken}</td>
                    <td>{c.average_accuracy_percent != null ? `${c.average_accuracy_percent.toFixed(1)}%` : "—"}</td>
                    <td>{strategyLabel(c.strategy_follow_status, c.strategy_follow_percent)}</td>
                    <td>{coachLabel(c.live_coach_status, c.coach_explanation_hints_total)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
                        disabled={openingPdf != null}
                        onClick={() => onViewPdf(c.student_username)}
                      >
                        {openingPdf === c.student_username ? "Preparing…" : "View PDF"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <p style={{ padding: "1rem", margin: 0, color: "var(--muted)" }}>No students match this filter.</p>
          ) : null}
        </div>
      )}
    </AdminPanel>
  );
}
