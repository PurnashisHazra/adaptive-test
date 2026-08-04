import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AdminPanel } from "../../components/AdminPanel";
import {
  approveAdminPracticeAttemptRequest,
  denyAdminPracticeAttemptRequest,
  getAdminStudentProfile,
  listAdminPapersCatalog,
  listAdminPracticeAttemptRequests,
  listAdminStudentExamTags,
  listAdminStudents,
  updateAdminStudentProfile,
} from "../../api/client";
import type { PracticeAttemptRequestAdminItem, StudentProfileListItem } from "../../api/types";
import { formatDateTimeIST } from "../../lib/istTime";
import { useAuthStore } from "../../store/authStore";

export function AdminStudentControlsPage() {
  const adminCode = useAuthStore((s) => s.session?.adminCode);
  const [students, setStudents] = useState<StudentProfileListItem[]>([]);
  const [papers, setPapers] = useState<{ id: string; title: string }[]>([]);
  const [examTags, setExamTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [attemptsAllowance, setAttemptsAllowance] = useState<string>("");
  const [blocked, setBlocked] = useState(false);
  const [allowedExams, setAllowedExams] = useState<Set<string>>(new Set());
  const [assignedPapers, setAssignedPapers] = useState<Set<string>>(new Set());
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [unlimitedAttempts, setUnlimitedAttempts] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PracticeAttemptRequestAdminItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadPendingRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      setPendingRequests(await listAdminPracticeAttemptRequests());
    } catch {
      toast.error("Could not load practice attempt requests");
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const [stu, cat, tags] = await Promise.all([listAdminStudents(), listAdminPapersCatalog(), listAdminStudentExamTags()]);
      setStudents(stu);
      setPapers(cat);
      setExamTags(tags);
      if (!selected && stu.length > 0) setSelected(stu[0].student_username);
    } catch {
      toast.error("Could not load students");
    } finally {
      setLoadingList(false);
    }
  }, [selected]);

  useEffect(() => {
    loadList();
    loadPendingRequests();
  }, [loadList, loadPendingRequests]);

  const loadDetail = useCallback(async (username: string) => {
    setLoadingDetail(true);
    try {
      const p = await getAdminStudentProfile(username);
      setDisplayName(p.display_name ?? "");
      setUnlimitedAttempts(Boolean(p.practice_attempts_unlimited));
      setAttemptsAllowance(
        p.practice_attempts_unlimited || p.practice_attempts_allowance == null
          ? "1"
          : String(p.practice_attempts_allowance),
      );
      setBlocked(p.blocked);
      setAllowedExams(new Set(p.allowed_exam_tags));
      setAssignedPapers(new Set(p.assigned_paper_ids));
      setAttemptsUsed(p.practice_attempts_used);
    } catch {
      toast.error("Could not load student profile");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadDetail(selected);
  }, [selected, loadDetail]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.student_username.toLowerCase().includes(q) ||
        (s.display_name ?? "").toLowerCase().includes(q),
    );
  }, [students, search]);

  const selectedSummary = students.find((s) => s.student_username === selected);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    let allowance: number | null = 1;
    if (!unlimitedAttempts) {
      const allowanceRaw = attemptsAllowance.trim();
      const n = Number(allowanceRaw || "1");
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Practice attempts allowance must be a non-negative number");
        return;
      }
      allowance = Math.floor(n);
    }
    setSaving(true);
    try {
      const updated = await updateAdminStudentProfile(selected, {
        display_name: displayName.trim() || null,
        practice_attempts_allowance: unlimitedAttempts ? null : allowance,
        practice_attempts_unlimited: unlimitedAttempts,
        allowed_exam_tags: Array.from(allowedExams),
        blocked,
        assigned_paper_ids: Array.from(assignedPapers),
      });
      setAttemptsUsed(updated.practice_attempts_used);
      toast.success("Student controls saved");
      await loadList();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function toggleExam(tag: string) {
    setAllowedExams((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function onApproveRequest(requestId: string) {
    setResolvingId(requestId);
    try {
      await approveAdminPracticeAttemptRequest(requestId);
      toast.success("Approved — student received one more practice attempt");
      await Promise.all([loadPendingRequests(), loadList()]);
      if (selected) await loadDetail(selected);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Approve failed");
    } finally {
      setResolvingId(null);
    }
  }

  async function onDenyRequest(requestId: string) {
    setResolvingId(requestId);
    try {
      await denyAdminPracticeAttemptRequest(requestId);
      toast.success("Request denied");
      await loadPendingRequests();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Deny failed");
    } finally {
      setResolvingId(null);
    }
  }

  function togglePaper(id: string) {
    setAssignedPapers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AdminPanel title="Student controls">
      <p className="app-page-lead">
        Assign question papers, cap practice test attempts, restrict exam types for adaptive practice, and block access to AdapTest.
        Only students who signed up with your admin code appear here.
      </p>

      {adminCode ? (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            padding: "0.85rem 1rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <span style={{ color: "var(--muted)" }}>Your admin code (share with students):</span>
          <code style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.06em" }}>{adminCode}</code>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: "1rem", borderColor: "#f59e0b", background: "#fffbeb" }}>
          <strong>No admin code assigned.</strong> Ask a super admin to set your admin code before students can link to you.
        </div>
      )}

      <section className="card" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Practice attempt requests</h2>
        <p style={{ margin: "0 0 0.75rem", color: "var(--muted)", fontSize: "0.9rem" }}>
          Students who used all allowed adaptive practice tests can request more. Approving grants one additional attempt.
        </p>
        {loadingRequests ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>Loading…</p>
        ) : pendingRequests.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>No pending requests.</p>
        ) : (
          <div className="review-sessions-table-wrap">
            <table className="review-sessions-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Used / allowed</th>
                  <th>Requested</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.student_username}</strong>
                      {r.display_name ? (
                        <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{r.display_name}</div>
                      ) : null}
                    </td>
                    <td style={{ fontSize: "0.9rem" }}>
                      {r.practice_attempts_used}
                      {r.practice_attempts_allowance != null ? ` / ${r.practice_attempts_allowance}` : " / unlimited"}
                    </td>
                    <td style={{ fontSize: "0.85rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {formatDateTimeIST(r.requested_at)}
                    </td>
                    <td style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{r.message || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ marginRight: "0.35rem", padding: "0.35rem 0.65rem", fontSize: "0.82rem" }}
                        disabled={resolvingId === r.id}
                        onClick={() => void onApproveRequest(r.id)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.82rem" }}
                        disabled={resolvingId === r.id}
                        onClick={() => void onDenyRequest(r.id)}
                      >
                        Deny
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="admin-student-controls">
        <aside className="admin-student-controls__list card" style={{ margin: 0 }}>
          <label className="label" htmlFor="student-search">
            Search students
          </label>
          <input
            id="student-search"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Username or display name"
          />
          {loadingList ? (
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Loading…</p>
          ) : filteredStudents.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              {adminCode ? "No students linked to your admin code yet." : "Assign an admin code to see students."}
            </p>
          ) : (
            <ul className="admin-student-controls__roster">
              {filteredStudents.map((s) => (
                <li key={s.student_username}>
                  <button
                    type="button"
                    className={[
                      "admin-student-controls__pick",
                      selected === s.student_username ? "admin-student-controls__pick--active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setSelected(s.student_username)}
                  >
                    <span className="admin-student-controls__pick-name">{s.student_username}</span>
                    {s.display_name ? (
                      <span className="admin-student-controls__pick-sub">{s.display_name}</span>
                    ) : null}
                    <span className="admin-student-controls__pick-badges">
                      {s.blocked ? <span className="badge" style={{ background: "#fef2f2", color: "#b91c1c" }}>Blocked</span> : null}
                      {s.assigned_paper_count > 0 ? (
                        <span className="badge">{s.assigned_paper_count} paper{s.assigned_paper_count === 1 ? "" : "s"}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="admin-student-controls__detail">
          {!selected ? (
            <p style={{ color: "var(--muted)" }}>Select a student to edit controls.</p>
          ) : loadingDetail ? (
            <p style={{ color: "var(--muted)" }}>Loading profile…</p>
          ) : (
            <form onSubmit={onSave} className="card" style={{ margin: 0 }}>
              <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>{selected}</h2>
              {selectedSummary ? (
                <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "var(--muted)" }}>
                  Practice attempts used: <strong>{selectedSummary.practice_attempts_used}</strong>
                  {selectedSummary.practice_attempts_unlimited
                    ? " (unlimited allowance)"
                    : selectedSummary.practice_attempts_allowance != null
                      ? ` / ${selectedSummary.practice_attempts_allowance} allowed`
                      : " / 1 allowed (default)"}
                </p>
              ) : null}

              <div style={{ marginBottom: "1rem" }}>
                <label className="label">Display name (shown when starting a test)</label>
                <input
                  className="input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={selected}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={unlimitedAttempts}
                    onChange={(e) => setUnlimitedAttempts(e.target.checked)}
                  />
                  Unlimited practice test attempts
                </label>
                <label className="label">Practice test attempts allowance</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={attemptsAllowance}
                  onChange={(e) => setAttemptsAllowance(e.target.value)}
                  disabled={unlimitedAttempts}
                  placeholder="1"
                />
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
                  Default for new students is 1. Counts standalone adaptive tests started (not question papers). Currently used:{" "}
                  {attemptsUsed}.
                </p>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
                  Block from AdapTest
                </label>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
                  Prevents practice tests and question papers until unchecked.
                </p>
              </div>

              <fieldset style={{ margin: "0 0 1rem", border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem 1rem" }}>
                <legend style={{ fontSize: "0.85rem", fontWeight: 600, padding: "0 0.35rem" }}>Allowed exam types (practice test)</legend>
                <p style={{ margin: "0 0 0.65rem", fontSize: "0.78rem", color: "var(--muted)" }}>
                  Leave all unchecked to allow any exam tag. When one or more are selected, the student may only start practice tests with those exam types.
                </p>
                <div className="admin-student-controls__checks">
                  {examTags.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>No exam tags in the question bank yet.</p>
                  ) : (
                    examTags.map((tag) => (
                      <label key={tag} className="admin-student-controls__check">
                        <input type="checkbox" checked={allowedExams.has(tag)} onChange={() => toggleExam(tag)} />
                        <span>{tag}</span>
                      </label>
                    ))
                  )}
                </div>
              </fieldset>

              <fieldset style={{ margin: "0 0 1.25rem", border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem 1rem" }}>
                <legend style={{ fontSize: "0.85rem", fontWeight: 600, padding: "0 0.35rem" }}>Assigned question papers</legend>
                <div className="admin-student-controls__checks">
                  {papers.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>No question papers created yet.</p>
                  ) : (
                    papers.map((p) => (
                      <label key={p.id} className="admin-student-controls__check">
                        <input type="checkbox" checked={assignedPapers.has(p.id)} onChange={() => togglePaper(p.id)} />
                        <span>{p.title}</span>
                      </label>
                    ))
                  )}
                </div>
              </fieldset>

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save student controls"}
              </button>
            </form>
          )}
        </div>
      </div>
    </AdminPanel>
  );
}
