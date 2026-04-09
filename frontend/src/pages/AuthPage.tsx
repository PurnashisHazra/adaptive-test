import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../api/types";

export function AuthPage() {
  const nav = useNavigate();
  const role = useAuthStore((s) => s.role);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const session = useAuthStore((s) => s.session);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signupRole, setSignupRole] = useState<Role>("student");
  const [submitting, setSubmitting] = useState(false);

  const initialRedirect = useMemo(() => {
    if (!role) return null;
    return role === "admin" ? "/admin" : "/start";
  }, [role]);

  if (isHydrated && role && initialRedirect) return <Navigate to={initialRedirect} replace />;

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await useAuthStore.getState().loginUser({ username, password });
      if (!res.ok) {
        toast.error(res.error ?? "Login failed");
        return;
      }
      const newRole = useAuthStore.getState().role;
      nav(newRole === "admin" ? "/admin" : "/start");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSignup(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const roleKey = signupRole === "admin" ? "admin" : "student";
      const res = await useAuthStore.getState().signupUser({ username, password, role_key: roleKey });
      if (!res.ok) {
        toast.error(res.error ?? "Signup failed");
        return;
      }
      nav(signupRole === "admin" ? "/admin" : "/start");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h1>{mode === "login" ? "Login" : "Sign up"}</h1>
      {session && (
        <p style={{ color: "var(--muted)", marginTop: "-0.5rem" }}>
          Logged in as <strong>{session.username}</strong> ({session.role})
        </p>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
        <button type="button" className={mode === "login" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setMode("login")}>
          Login
        </button>
        <button type="button" className={mode === "signup" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setMode("signup")}>
          Sign up
        </button>
      </div>

      {mode === "login" ? (
        <form onSubmit={onLogin} className="card" style={{ marginTop: "1.25rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Ada Lovelace" required />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.75rem" }}>
            Use your username/password. Role is embedded in the login token (admin vs student).
          </p>
        </form>
      ) : (
        <form onSubmit={onSignup} className="card" style={{ marginTop: "1.25rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Ada Lovelace" required />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Role (default is student)</label>
            <select className="input" value={signupRole} onChange={(e) => setSignupRole(e.target.value as Role)}>
              <option value="student">student</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Creating…" : "Create account"}
          </button>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.75rem" }}>
            Password is stored as a bcrypt hash in the backend.
          </p>
        </form>
      )}
    </div>
  );
}

