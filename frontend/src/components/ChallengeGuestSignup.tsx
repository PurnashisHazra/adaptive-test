import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import { clearGuestSession } from "../lib/guestSession";

export function ChallengeGuestSignup() {
  const nav = useNavigate();
  const signupUser = useAuthStore((s) => s.signupUser);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (name.length < 2) {
      toast.error("Enter your name (at least 2 characters)");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const res = await signupUser({ username: name, password, mobile: "" });
      if (!res.ok) {
        toast.error(res.error ?? "Could not create account");
        return;
      }
      clearGuestSession();
      toast.success("Account created — welcome to AdapTest");
      nav("/", { replace: true });
    } catch {
      toast.error("Could not create account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: "1.5rem", maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
      <h3 style={{ marginTop: 0 }}>Save your progress</h3>
      <p style={{ color: "var(--muted)", margin: "0 0 1rem", lineHeight: 1.55 }}>
        You finished as a guest. Create a free AdapTest account with your name and password to save this attempt and
        track future challenges.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label className="label">
          Your name
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="name"
            placeholder="How you want to appear on leaderboards"
            required
            minLength={2}
          />
        </label>
        <label className="label">
          Password
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Creating account…" : "Sign up free"}
        </button>
      </form>
    </div>
  );
}
