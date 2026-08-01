import { useEffect, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { createConsultationRequest, createConsultationWithSignup } from "../api/client";
import { useAuthStore } from "../store/authStore";
import "../styles/topper-booking.css";

export function FreeConsultationModal({ onClose }: { onClose: () => void }) {
  const role = useAuthStore((s) => s.role);
  const signedIn = role === "student";

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const digits = mobile.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }

    setSubmitting(true);
    try {
      if (signedIn) {
        await createConsultationRequest({ mobile: digits });
      } else {
        if (!username.trim()) {
          toast.error("Enter your email");
          return;
        }
        if (password.length < 8) {
          toast.error("Password must be at least 8 characters");
          return;
        }
        const res = await createConsultationWithSignup({
          username: username.trim(),
          password,
          mobile: digits,
        });
        useAuthStore.getState().setAuthFromResponse(res.auth);
      }
      setSubmitted(true);
      toast.success("Request received! Our team will contact you soon.");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not submit request");
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
          <h2>Free career consultation</h2>
          <p className="topper-booking-sub">
            Share your mobile number and we will reach out to schedule a free 1-on-1 counseling session.
          </p>

          {submitted ? (
            <div className="topper-booking-status-box topper-booking-status-box--success">
              Thank you! We have received your request and will contact you on your mobile number shortly.
            </div>
          ) : (
            <form onSubmit={(e) => void onSubmit(e)}>
              {!signedIn ? (
                <>
                  <div className="topper-booking-field">
                    <label htmlFor="fc-email">Email (login username)</label>
                    <input
                      id="fc-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                  <div className="topper-booking-field">
                    <label htmlFor="fc-password">Password</label>
                    <input
                      id="fc-password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </>
              ) : null}
              <div className="topper-booking-field">
                <label htmlFor="fc-mobile">Mobile number</label>
                <input
                  id="fc-mobile"
                  type="tel"
                  required
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="10-digit mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />
              </div>
              <div className="topper-booking-actions">
                <button type="button" className="landing-btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="landing-btn-primary" disabled={submitting}>
                  {submitting ? "Submitting…" : "Request consultation"}
                </button>
              </div>
            </form>
          )}

          {submitted ? (
            <div className="topper-booking-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="landing-btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
