import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";

/** Blocking modal for students who must link an instructor admin code before using the app. */
export function AdminCodeModal() {
  const claimAdminCodeUser = useAuthStore((s) => s.claimAdminCodeUser);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("Enter your instructor admin code");
      return;
    }
    setSubmitting(true);
    try {
      const res = await claimAdminCodeUser(code.trim());
      if (!res.ok) {
        toast.error(res.error ?? "Invalid admin code");
        return;
      }
      toast.success("Linked to your instructor");
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="radar-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-code-modal-title">
      <div className="radar-modal-panel" style={{ maxWidth: 440, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <h2 id="admin-code-modal-title" style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>
          Link your instructor
        </h2>
        <p style={{ color: "var(--muted)", margin: "0 0 1.25rem", fontSize: "0.95rem" }}>
          Enter the admin code from your instructor to continue. If you do not have one, contact them before using AdapTest.
        </p>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label className="label" htmlFor="admin-code-modal-input">
              Admin code
            </label>
            <input
              id="admin-code-modal-input"
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3"
              autoComplete="off"
              required
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Verifying…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
