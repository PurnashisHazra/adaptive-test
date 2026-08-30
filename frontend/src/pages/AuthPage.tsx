import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { Seo } from "../components/Seo";
import { SEO_AUTH } from "../seo/pages";
import { AppPage } from "../components/AppPage";
import type { Role } from "../api/types";

function redirectForRole(role: Role, studentPath: string): string {
  if (role === "god" || role === "super_admin") return "/super-admin";
  if (role === "admin") return "/admin";
  return studentPath;
}

function normalizeMobileInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function AuthPage() {
  const nav = useNavigate();
  const location = useLocation();
  const role = useAuthStore((s) => s.role);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const session = useAuthStore((s) => s.session);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  const postAuthStudentPath = useMemo(() => {
    const from = (location.state as { from?: string } | null)?.from;
    if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) return from;
    return "/";
  }, [location.state]);

  if (!isHydrated) {
    return (
      <AppPage title="Login" lead="Restoring your session…">
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </AppPage>
    );
  }

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
    const digits = normalizeMobileInput(mobile);
    if (digits.length < 10) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setSubmitting(true);
    try {
      const res = await useAuthStore.getState().signupUser({ username, password, mobile: digits });
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
    <AppPage
      narrow
      title={mode === "login" ? "Login" : "Sign up"}
      lead={
        session ? (
          <>
            Logged in as <strong>{session.username}</strong> ({session.role})
          </>
        ) : (
          "Access challenges, adaptive practice, and your performance dashboard."
        )
      }
      filters={
        <div className="app-page-tabs">
          <button type="button" className={mode === "login" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setMode("login")}>
            Login
          </button>
          <button type="button" className={mode === "signup" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setMode("signup")}>
            Sign up
          </button>
        </div>
      }
    >
      <Seo seo={SEO_AUTH} />
      {mode === "login" ? (
        <form onSubmit={onLogin} className="card app-form-card">
          <div>
            <label className="label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p className="app-card-subtitle" style={{ marginBottom: 0, marginTop: "0.75rem" }}>
            Add or update your instructor admin code anytime under <strong>Profile</strong>.
          </p>
        </form>
      ) : (
        <form onSubmit={onSignup} className="card app-form-card">
          <div>
            <label className="label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div>
            <label className="label">Mobile number</label>
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={mobile}
              onChange={(e) => setMobile(normalizeMobileInput(e.target.value))}
              placeholder="10-digit mobile number"
              maxLength={15}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Creating…" : "Create student account"}
          </button>
          <p className="app-card-subtitle" style={{ marginBottom: 0, marginTop: "0.75rem" }}>
            Admin code is optional at signup. Link your instructor later from Profile when you have their code.
          </p>
        </form>
      )}
    </AppPage>
  );
}
