import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import {
  createMentorshipBooking,
  getMentorshipBooking,
} from "../api/client";
import type { MentorshipBookingOut } from "../api/types";
import { useAuthStore } from "../store/authStore";
import "../styles/topper-booking.css";

type Step = "details" | "account" | "payment";

function formatTimer(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function tomorrowIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function TopperBookingModal({ onClose }: { onClose: () => void }) {
  const role = useAuthStore((s) => s.role);
  const loginUser = useAuthStore((s) => s.loginUser);
  const signupUser = useAuthStore((s) => s.signupUser);
  const signedIn = role === "student";

  const [step, setStep] = useState<Step>("details");
  const [accountMode, setAccountMode] = useState<"login" | "signup">("login");
  const [submitting, setSubmitting] = useState(false);
  const [sessionDate, setSessionDate] = useState(tomorrowIsoDate());
  const [sessionTime, setSessionTime] = useState("18:00");
  const [preMeetQuestion, setPreMeetQuestion] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [booking, setBooking] = useState<MentorshipBookingOut | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const stepIndex = step === "details" ? 0 : step === "account" ? 1 : 2;

  const displayPhase = booking?.display_phase ?? "pay_now";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && displayPhase !== "pay_now") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [displayPhase, onClose]);

  const syncBooking = useCallback(async (bookingId: string) => {
    const data = await getMentorshipBooking(bookingId);
    setBooking(data);
    if (data.seconds_remaining != null) {
      setSecondsLeft(data.seconds_remaining);
    }
    return data;
  }, []);

  useEffect(() => {
    if (!booking?.id || step !== "payment") return;
    if (displayPhase === "confirmed" || displayPhase === "rejected") return;

    const poll = window.setInterval(() => {
      void syncBooking(booking.id).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(poll);
  }, [booking?.id, step, displayPhase, syncBooking]);

  useEffect(() => {
    if (step !== "payment" || displayPhase !== "pay_now" || secondsLeft == null) return;
    if (secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s == null ? s : Math.max(0, s - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [step, displayPhase, secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0 && booking?.id && displayPhase === "pay_now") {
      void syncBooking(booking.id);
    }
  }, [secondsLeft, booking?.id, displayPhase, syncBooking]);

  async function submitDetails(e: FormEvent) {
    e.preventDefault();
    if (preMeetQuestion.trim().length < 10) {
      toast.error("Please share at least a short pre-meet question (10+ characters)");
      return;
    }
    if (signedIn) {
      await startPayment();
    } else {
      setStep("account");
    }
  }

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
          toast.error("Student account required to book a session");
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
      await startPayment();
    } finally {
      setSubmitting(false);
    }
  }

  async function startPayment() {
    setSubmitting(true);
    try {
      const created = await createMentorshipBooking({
        session_date: sessionDate,
        session_time: sessionTime,
        pre_meet_question: preMeetQuestion.trim(),
      });
      setBooking(created);
      setSecondsLeft(created.seconds_remaining ?? 300);
      setStep("payment");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not start booking");
    } finally {
      setSubmitting(false);
    }
  }

  const sessionSummary = useMemo(() => {
    if (!booking) return null;
    return `${booking.session_date} at ${booking.session_time}`;
  }, [booking]);

  return (
    <div className="topper-booking-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="topper-booking-modal-wrap" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="topper-booking-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="topper-booking-modal">
          <h2>Book session with Toppers</h2>
          <p className="topper-booking-sub">30-minute mentorship · ₹100 · UPI payment</p>

          <div className="topper-booking-steps" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className={`topper-booking-step${i <= stepIndex ? " topper-booking-step--active" : ""}`} />
            ))}
          </div>

          {step === "details" ? (
            <form onSubmit={(e) => void submitDetails(e)}>
              <div className="topper-booking-field">
                <label htmlFor="tb-date">Preferred date</label>
                <input
                  id="tb-date"
                  type="date"
                  required
                  min={tomorrowIsoDate()}
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                />
              </div>
              <div className="topper-booking-field">
                <label htmlFor="tb-time">Preferred time</label>
                <input
                  id="tb-time"
                  type="time"
                  required
                  value={sessionTime}
                  onChange={(e) => setSessionTime(e.target.value)}
                />
              </div>
              <div className="topper-booking-field">
                <label htmlFor="tb-question">Pre-meet question</label>
                <textarea
                  id="tb-question"
                  required
                  minLength={10}
                  maxLength={2000}
                  placeholder="What would you like the mentor to focus on?"
                  value={preMeetQuestion}
                  onChange={(e) => setPreMeetQuestion(e.target.value)}
                />
              </div>
              <div className="topper-booking-actions">
                <button type="button" className="landing-btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="landing-btn-primary" disabled={submitting}>
                  {submitting ? "Please wait…" : signedIn ? "Continue to payment" : "Continue"}
                </button>
              </div>
            </form>
          ) : null}

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
                  ? "Log in to continue with your booking."
                  : "Create an account to save your session and track payment."}
              </p>
              <div className="topper-booking-field">
                <label htmlFor="tb-email">{accountMode === "signup" ? "Email (login username)" : "Username or email"}</label>
                <input
                  id="tb-email"
                  type={accountMode === "signup" ? "email" : "text"}
                  required
                  autoComplete={accountMode === "signup" ? "email" : "username"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              {accountMode === "signup" ? (
                <div className="topper-booking-field">
                  <label htmlFor="tb-mobile">Mobile</label>
                  <input
                    id="tb-mobile"
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
                <label htmlFor="tb-password">Password</label>
                <input
                  id="tb-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={accountMode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="topper-booking-actions">
                <button type="button" className="landing-btn-secondary" onClick={() => setStep("details")}>
                  Back
                </button>
                <button type="submit" className="landing-btn-primary" disabled={submitting}>
                  {submitting
                    ? "Please wait…"
                    : accountMode === "login"
                      ? "Log in & pay ₹100"
                      : "Create account & pay ₹100"}
                </button>
              </div>
            </form>
          ) : null}

          {step === "payment" && booking ? (
            <div>
              {displayPhase === "confirmed" ? (
                <>
                  <div className="topper-booking-status-box topper-booking-status-box--success">
                    Payment confirmed! Your topper session is booked for <strong>{sessionSummary}</strong>. We will
                    share meeting details on your registered email.
                  </div>
                  <div className="topper-booking-actions">
                    <button type="button" className="landing-btn-primary" onClick={onClose}>
                      Done
                    </button>
                  </div>
                </>
              ) : displayPhase === "rejected" ? (
                <>
                  <div className="topper-booking-status-box">
                    We could not verify this payment. Please contact support or try booking again.
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
                    Your payment is being reviewed. This usually takes a few minutes — keep this page open and we will
                    confirm automatically once verified.
                  </div>
                  <p className="topper-booking-sub">Session: {sessionSummary}</p>
                  <div className="topper-booking-actions">
                    <button type="button" className="landing-btn-secondary" onClick={onClose}>
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="topper-booking-amount">Pay ₹{booking.amount_inr} via UPI</p>
                  <div className="topper-booking-qr-wrap">
                    <img
                      src="/mentorship-payment-qr.png"
                      alt="UPI QR code for ₹100 mentorship payment"
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
                    Scan the QR code and pay exactly <strong>₹{booking.amount_inr}</strong>. Do not close this window —
                    we will confirm as soon as payment is approved.
                  </div>
                  <p className="topper-booking-sub" style={{ marginBottom: 0 }}>
                    Session: {sessionSummary}
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
