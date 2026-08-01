import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { createPaperUnlock, getPaperUnlock } from "../api/client";
import type { PaperUnlockOut } from "../api/types";
import { useAuthStore } from "../store/authStore";
import "../styles/topper-booking.css";

type Step = "account" | "payment";

function formatTimer(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function PaperUnlockModal({
  paperId,
  paperTitle,
  onClose,
  onUnlocked,
}: {
  paperId: string;
  paperTitle: string;
  onClose: () => void;
  onUnlocked?: () => void;
}) {
  const role = useAuthStore((s) => s.role);
  const loginUser = useAuthStore((s) => s.loginUser);
  const signupUser = useAuthStore((s) => s.signupUser);
  const signedIn = role === "student";

  const [step, setStep] = useState<Step>(signedIn ? "payment" : "account");
  const [accountMode, setAccountMode] = useState<"login" | "signup">("signup");
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [purchase, setPurchase] = useState<PaperUnlockOut | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const paymentStarted = useRef(false);

  const displayPhase = purchase?.display_phase ?? "pay_now";
  const stepIndex = step === "account" ? 0 : 1;

  const startPayment = useCallback(async () => {
    setSubmitting(true);
    try {
      const created = await createPaperUnlock({ paper_id: paperId });
      setPurchase(created);
      setSecondsLeft(created.seconds_remaining ?? 300);
      setStep("payment");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not start unlock");
    } finally {
      setSubmitting(false);
    }
  }, [paperId]);

  useEffect(() => {
    if (!signedIn || paymentStarted.current) return;
    paymentStarted.current = true;
    void startPayment();
  }, [signedIn, startPayment]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && displayPhase !== "pay_now") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [displayPhase, onClose]);

  const syncPurchase = useCallback(async (purchaseId: string) => {
    const data = await getPaperUnlock(purchaseId);
    setPurchase(data);
    if (data.seconds_remaining != null) {
      setSecondsLeft(data.seconds_remaining);
    }
    if (data.display_phase === "confirmed") {
      onUnlocked?.();
    }
    return data;
  }, [onUnlocked]);

  useEffect(() => {
    if (!purchase?.id || step !== "payment") return;
    if (displayPhase === "confirmed" || displayPhase === "rejected") return;

    const poll = window.setInterval(() => {
      void syncPurchase(purchase.id).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(poll);
  }, [purchase?.id, step, displayPhase, syncPurchase]);

  useEffect(() => {
    if (step !== "payment" || displayPhase !== "pay_now" || secondsLeft == null) return;
    if (secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s == null ? s : Math.max(0, s - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, displayPhase, secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0 && purchase?.id && displayPhase === "pay_now") {
      void syncPurchase(purchase.id);
    }
  }, [secondsLeft, purchase?.id, displayPhase, syncPurchase]);

  async function submitAccount(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (accountMode === "login") {
        const res = await loginUser({ username: username.trim(), password });
        if (!res.ok) {
          toast.error(res.error ?? "Login failed");
          return;
        }
        const newRole = useAuthStore.getState().role;
        if (newRole !== "student") {
          toast.error("Student account required to unlock papers");
          useAuthStore.getState().logout();
          return;
        }
      } else {
        const digits = mobile.replace(/\D/g, "");
        if (digits.length < 10) {
          toast.error("Enter a valid 10-digit mobile number");
          return;
        }
        const res = await signupUser({ username: username.trim(), password, mobile: digits });
        if (!res.ok) {
          toast.error(res.error ?? "Signup failed");
          return;
        }
      }
      setStep("payment");
      await startPayment();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="topper-booking-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="topper-booking-modal-wrap" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="topper-booking-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="topper-booking-modal">
          <h2>Unlock question paper</h2>
          <p className="topper-booking-sub">
            {paperTitle} · ₹100 · UPI payment
          </p>

          <div className="topper-booking-steps" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className={`topper-booking-step${i <= stepIndex ? " topper-booking-step--active" : ""}`} />
            ))}
          </div>

          {step === "account" ? (
            <form onSubmit={(e) => void submitAccount(e)}>
              <div className="topper-booking-auth-tabs" role="tablist" aria-label="Sign in or sign up">
                <button
                  type="button"
                  role="tab"
                  aria-selected={accountMode === "login"}
                  className={`topper-booking-auth-tab${accountMode === "login" ? " topper-booking-auth-tab--active" : ""}`}
                  onClick={() => setAccountMode("login")}
                >
                  Log in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={accountMode === "signup"}
                  className={`topper-booking-auth-tab${accountMode === "signup" ? " topper-booking-auth-tab--active" : ""}`}
                  onClick={() => setAccountMode("signup")}
                >
                  Sign up
                </button>
              </div>
              <p className="topper-booking-sub" style={{ marginTop: 0 }}>
                {accountMode === "login"
                  ? "Log in to unlock this paper."
                  : "Create a free account, then pay ₹100 to access this mock test."}
              </p>
              <div className="topper-booking-field">
                <label htmlFor="pu-email">{accountMode === "signup" ? "Email (login username)" : "Username or email"}</label>
                <input
                  id="pu-email"
                  type={accountMode === "signup" ? "email" : "text"}
                  required
                  autoComplete={accountMode === "signup" ? "email" : "username"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              {accountMode === "signup" ? (
                <div className="topper-booking-field">
                  <label htmlFor="pu-mobile">Mobile</label>
                  <input
                    id="pu-mobile"
                    type="tel"
                    required
                    inputMode="numeric"
                    autoComplete="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="topper-booking-field">
                <label htmlFor="pu-password">Password</label>
                <input
                  id="pu-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={accountMode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="topper-booking-actions">
                <button type="button" className="landing-btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="landing-btn-primary" disabled={submitting}>
                  {submitting
                    ? "Please wait…"
                    : accountMode === "login"
                      ? "Log in & continue"
                      : "Sign up & unlock"}
                </button>
              </div>
            </form>
          ) : null}

          {step === "payment" && !purchase && submitting ? (
            <p className="topper-booking-sub">Preparing payment…</p>
          ) : null}

          {step === "payment" && purchase ? (
            <div>
              {displayPhase === "confirmed" ? (
                <>
                  <div className="topper-booking-status-box topper-booking-status-box--success">
                    Payment confirmed! <strong>{purchase.paper_title}</strong> is now assigned to your account. Head
                    to Question Papers to start the test.
                  </div>
                  <div className="topper-booking-actions">
                    <Link to="/papers" className="landing-btn-primary" onClick={onClose}>
                      Go to my papers
                    </Link>
                    <button type="button" className="landing-btn-secondary" onClick={onClose}>
                      Close
                    </button>
                  </div>
                </>
              ) : displayPhase === "rejected" ? (
                <>
                  <div className="topper-booking-status-box">
                    We could not verify this payment. Please contact support or try again.
                  </div>
                  <div className="topper-booking-actions">
                    <button type="button" className="landing-btn-primary" onClick={onClose}>
                      Close
                    </button>
                  </div>
                </>
              ) : displayPhase === "under_review" ? (
                <>
                  <div className="topper-booking-status-box topper-booking-status-box--review">
                    Your payment is being reviewed. Keep this page open — we will unlock the paper automatically once
                    verified.
                  </div>
                  <p className="topper-booking-sub">Paper: {purchase.paper_title}</p>
                  <div className="topper-booking-actions">
                    <button type="button" className="landing-btn-secondary" onClick={onClose}>
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="topper-booking-amount">Pay ₹{purchase.amount_inr} via UPI</p>
                  <div className="topper-booking-qr-wrap">
                    <img
                      src="/mentorship-payment-qr.png"
                      alt={`UPI QR code for ₹${purchase.amount_inr} paper unlock`}
                      className="topper-booking-qr"
                    />
                    <div
                      className={`topper-booking-timer${secondsLeft === 0 ? " topper-booking-timer--expired" : ""}`}
                      aria-live="polite"
                    >
                      {formatTimer(secondsLeft ?? 0)}
                    </div>
                  </div>
                  <div className="topper-booking-status-box">
                    Scan the QR code and pay exactly <strong>₹{purchase.amount_inr}</strong>. After approval, this paper
                    is assigned to your account automatically.
                  </div>
                  <p className="topper-booking-sub" style={{ marginBottom: 0 }}>
                    Paper: {purchase.paper_title}
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
