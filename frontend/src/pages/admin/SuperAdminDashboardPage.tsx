import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AdminLimitsPanel } from "../../components/AdminLimitsPanel";
import {
  generateSuperAdminUserAdminCode,
  listSuperAdminUsers,
  setSuperAdminUserAdminCode,
  updateSuperAdminUserRole,
} from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import type { Role, SuperAdminUserRow } from "../../api/types";

const STAFF_ROLES: Role[] = ["student", "admin", "super_admin"];
const GOD_ROLES: Role[] = ["student", "admin", "super_admin", "god"];

function roleLabel(role: Role) {
  if (role === "god") return "God";
  if (role === "super_admin") return "Super admin";
  if (role === "admin") return "Admin";
  return "Student";
}

export function SuperAdminDashboardPage() {
  const actorRole = useAuthStore((s) => s.role);
  const assignableRoles = actorRole === "god" ? GOD_ROLES : STAFF_ROLES;
  const [users, setUsers] = useState<SuperAdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [codeDraft, setCodeDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [limitsOpen, setLimitsOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listSuperAdminUsers();
      setUsers(rows);
      const drafts: Record<string, string> = {};
      rows.forEach((u) => {
        if (u.admin_code) drafts[u.username] = u.admin_code;
      });
      setCodeDraft(drafts);
    } catch {
      toast.error("Could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.username.toLowerCase().includes(q) || (u.admin_code ?? "").toLowerCase().includes(q);
  });

  async function onRoleChange(username: string, role: Role) {
    setBusy(`role:${username}`);
    try {
      await updateSuperAdminUserRole(username, role);
      toast.success(`Updated ${username} to ${roleLabel(role)}`);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Role update failed");
    } finally {
      setBusy(null);
    }
  }

  async function onSaveCode(username: string) {
    const code = (codeDraft[username] ?? "").trim();
    if (!code) {
      toast.error("Enter an admin code");
      return;
    }
    setBusy(`code:${username}`);
    try {
      await setSuperAdminUserAdminCode(username, code);
      toast.success(`Admin code saved for ${username}`);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not save admin code");
    } finally {
      setBusy(null);
    }
  }

  async function onGenerateCode(username: string) {
    setBusy(`gen:${username}`);
    try {
      const row = await generateSuperAdminUserAdminCode(username);
      toast.success(`Generated code ${row.admin_code} for ${username}`);
      await load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Generate failed");
    } finally {
      setBusy(null);
    }
  }

  function renderRoleSelect(user: SuperAdminUserRow) {
    return (
      <select
        className="input"
        value={user.role}
        disabled={busy === `role:${user.username}` || (user.role === "god" && actorRole !== "god")}
        onChange={(e) => void onRoleChange(user.username, e.target.value as Role)}
        aria-label={`Role for ${user.username}`}
      >
        {Array.from(new Set([...assignableRoles, user.role])).map((r) => (
          <option key={r} value={r}>
            {roleLabel(r)}
          </option>
        ))}
      </select>
    );
  }

  function renderAdminCodeControls(user: SuperAdminUserRow) {
    if (user.role !== "admin") {
      return <span style={{ color: "var(--landing-muted)" }}>—</span>;
    }
    return (
      <div className="super-admin-code-cell">
        <input
          className="input"
          value={codeDraft[user.username] ?? ""}
          onChange={(e) =>
            setCodeDraft((prev) => ({ ...prev, [user.username]: e.target.value.toUpperCase() }))
          }
          placeholder="ADMINCODE"
          aria-label={`Admin code for ${user.username}`}
        />
        <button
          type="button"
          className="landing-btn-primary"
          disabled={busy === `code:${user.username}`}
          onClick={() => void onSaveCode(user.username)}
        >
          Save
        </button>
        <button
          type="button"
          className="landing-btn-secondary"
          disabled={busy === `gen:${user.username}`}
          onClick={() => void onGenerateCode(user.username)}
        >
          Generate
        </button>
      </div>
    );
  }

  function renderQuotaToggle(user: SuperAdminUserRow) {
    if (user.role !== "admin") {
      return <span style={{ color: "var(--landing-muted)" }}>—</span>;
    }
    const open = limitsOpen === user.username;
    return (
      <button
        type="button"
        className="landing-btn-secondary"
        onClick={() => setLimitsOpen((cur) => (cur === user.username ? null : user.username))}
      >
        {open ? "Hide limits" : "Configure"}
      </button>
    );
  }

  return (
    <div>
      <p className="sa-page-lead">
        Assign student, admin, and super-admin roles
        {actorRole === "god" ? ", plus the god role" : ""}. Admin codes and quotas apply to instructors.
      </p>

      <div className="sa-toolbar">
        <input
          className="input sa-search"
          placeholder="Search users or admin codes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="landing-btn-secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="skeleton sa-skeleton" aria-busy="true">
          Loading users…
        </div>
      ) : filtered.length === 0 ? (
        <div className="sa-empty">No users match that search.</div>
      ) : (
        <div className="sa-user-cards">
          {filtered.map((u) => (
            <article className="sa-user-card" key={u.username}>
              <div className="sa-user-card__top">
                <h2 className="sa-user-card__name">{u.username}</h2>
                <span className="sa-role-badge">{roleLabel(u.role)}</span>
              </div>
              <div className="sa-user-field">
                <label className="label">Role</label>
                {renderRoleSelect(u)}
              </div>
              {u.role === "admin" ? (
                <div className="sa-user-field">
                  <label className="label">Admin code</label>
                  {renderAdminCodeControls(u)}
                </div>
              ) : null}
              <div className="sa-user-meta">Linked student code: {u.assigned_admin_code ?? "—"}</div>
              {u.role === "admin" ? (
                <div className="sa-user-actions">
                  {renderQuotaToggle(u)}
                </div>
              ) : null}
              {u.role === "admin" && limitsOpen === u.username ? (
                <div style={{ marginTop: "0.85rem" }}>
                  <AdminLimitsPanel user={u} onSaved={() => void load()} />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
