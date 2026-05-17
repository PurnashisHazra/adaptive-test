import { Fragment, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AdminLimitsPanel } from "../../components/AdminLimitsPanel";
import { AdminPanel } from "../../components/AdminPanel";
import {
  generateSuperAdminUserAdminCode,
  listSuperAdminUsers,
  setSuperAdminUserAdminCode,
  updateSuperAdminUserRole,
} from "../../api/client";
import type { Role, SuperAdminUserRow } from "../../api/types";

const ROLES: Role[] = ["student", "admin", "super_admin"];

export function SuperAdminDashboardPage() {
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
    load();
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
      toast.success(`Updated ${username} to ${role}`);
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

  return (
    <AdminPanel title="Users & roles">
      <p style={{ color: "var(--muted)", marginTop: 0, maxWidth: 720 }}>
        Assign roles, admin codes, and per-instructor quotas. Defaults are unlimited until you set limits below.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <input
          className="input"
          placeholder="Search users or admin codes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading users…</p>
      ) : (
        <div className="super-admin-table-wrap">
          <table className="super-admin-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Admin code</th>
                <th>Student linked code</th>
                <th>Quotas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <Fragment key={u.username}>
                  <tr>
                    <td>
                      <strong>{u.username}</strong>
                    </td>
                    <td>
                      <select
                        className="input"
                        value={u.role}
                        disabled={busy === `role:${u.username}`}
                        onChange={(e) => onRoleChange(u.username, e.target.value as Role)}
                        style={{ minWidth: 130 }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {u.role === "admin" ? (
                        <div className="super-admin-code-cell">
                          <input
                            className="input"
                            value={codeDraft[u.username] ?? ""}
                            onChange={(e) =>
                              setCodeDraft((prev) => ({ ...prev, [u.username]: e.target.value.toUpperCase() }))
                            }
                            placeholder="ADMINCODE"
                          />
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busy === `code:${u.username}`}
                            onClick={() => onSaveCode(u.username)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busy === `gen:${u.username}`}
                            onClick={() => onGenerateCode(u.username)}
                          >
                            Generate
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ color: "var(--muted)", fontFamily: "var(--mono, monospace)" }}>
                      {u.assigned_admin_code ?? "—"}
                    </td>
                    <td>
                      {u.role === "admin" ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setLimitsOpen((cur) => (cur === u.username ? null : u.username))}
                        >
                          {limitsOpen === u.username ? "Hide limits" : "Configure"}
                        </button>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                  {u.role === "admin" && limitsOpen === u.username ? (
                    <tr key={`${u.username}-limits`}>
                      <td colSpan={5}>
                        <AdminLimitsPanel user={u} onSaved={load} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanel>
  );
}
