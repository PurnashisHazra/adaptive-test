import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { submitChallengeGuestSignup } from "../api/client";
import { getGuestEmail, setGuestEmail } from "../lib/guestSession";
import { useAuthStore } from "../store/authStore";

export function ChallengeGuestEmailGate({
  challengeAttemptId,
  onUnlocked,
}: {
  challengeAttemptId: string;
  onUnlocked: (opts: { accountCreated: boolean }) => void;
}) {
  const setAuthFromResponse = useAuthStore((s) => s.setAuthFromResponse);
  const [email, setEmail] = useState(() => getGuestEmail());
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || !value.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const auth = await submitChallengeGuestSignup(challengeAttemptId, value, password);
      setGuestEmail(value);
      setAuthFromResponse(auth);
      onUnlocked({ accountCreated: true });
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not create account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 440, margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Almost there</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 1.25rem", lineHeight: 1.55 }}>
        Enter your email and choose a password to create your account and unlock your percentile, score breakdown, and
        performance insights.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "left" }}>
        <label className="label">
          Email
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            required
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
            placeholder="At least 8 characters"
            required
            minLength={8}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Creating account…" : "View my results"}
        </button>
      </form>
    </div>
  );
}
