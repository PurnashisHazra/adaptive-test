import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../api/types";

function redirectForRole(role: Role, studentPath: string): string {
  if (role === "super_admin") return "/super-admin";
  if (role === "admin") return "/admin";
  return studentPath;
}

export function AuthPage() {
  const nav = useNavigate();
  const location = useLocation();
  const role = useAuthStore((s) => s.role);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const session = useAuthStore((s) => s.session);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const postAuthStudentPath = useMemo(() => {
    const from = (location.state as { from?: string } | null)?.from;
    if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) return from;
    return "/";
  }, [location.state]);

  if (isHydrated && role) {
    return <Navigate to={redirectForRole(role, postAuthStudentPath)} replace />;
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await useAuthStore.getState().loginUser({ username, password });
      if (!res.ok) {
        toast.error(res.error ?? "Login failed");
        return;
      }
      const newRole = useAuthStore.getState().role!;
      nav(redirectForRole(newRole, postAuthStudentPath));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSignup(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await useAuthStore.getState().signupUser({ username, password });
      if (!res.ok) {
        toast.error(res.error ?? "Signup failed");
        return;
      }
      nav(postAuthStudentPath);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
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
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.75rem" }}>
            Students without an instructor link will be prompted for an admin code after login.
          </p>
        </form>
      ) : (
        <form onSubmit={onSignup} className="card" style={{ marginTop: "1.25rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Creating…" : "Create student account"}
          </button>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.75rem" }}>
            After signup you will enter your instructor&apos;s admin code to start using AdapTest.
          </p>
        </form>
      )}
    </div>
  );
}
