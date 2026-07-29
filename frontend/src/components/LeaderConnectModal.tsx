import { useEffect, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { submitLeaderConnectRequest } from "../api/client";
import "../styles/leader-connect.css";

type LeaderConnectModalProps = {
  company: string;
  onClose: () => void;
};

export function LeaderConnectModal({ company, onClose }: LeaderConnectModalProps) {
  const [mainTopic, setMainTopic] = useState("");
  const [companyInterested, setCompanyInterested] = useState(company);
  const [mobile, setMobile] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setCompanyInterested(company);
  }, [company]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("company_clicked", company);
      form.append("main_topic", mainTopic.trim());
      form.append("company_interested_in", companyInterested.trim());
      form.append("mobile", mobile.trim());
      if (cvFile) form.append("cv_file", cvFile);
      await submitLeaderConnectRequest(form);
      setSubmitted(true);
      toast.success("Request submitted — our team will connect you with alumni");
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
    <div className="leader-connect-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="leader-connect-modal-wrap" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="leader-connect-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="leader-connect-modal">
          {submitted ? (
            <>
              <h2>Request received</h2>
              <p className="leader-connect-sub">
                Thank you! We will match you with ex-students from {companyInterested} and reach out on{" "}
                {mobile.trim() || "your mobile"} soon.
              </p>
              <button type="button" className="landing-btn-primary landing-btn-lg" onClick={onClose}>
                Done
              </button>
            </>
          ) : (
            <>
              <h2>Connect with ex-students who made it</h2>
              <p className="leader-connect-sub">
                You selected <strong>{company}</strong>. Share what you want to discuss and we will connect you with
                alumni now at top firms.
              </p>
              <form onSubmit={(e) => void onSubmit(e)}>
                <div className="leader-connect-field">
                  <label htmlFor="lc-topic">Main topic of discussion</label>
                  <textarea
                    id="lc-topic"
                    required
                    minLength={10}
                    rows={3}
                    placeholder="e.g. Breaking into product roles, MBA vs direct industry path…"
                    value={mainTopic}
                    onChange={(e) => setMainTopic(e.target.value)}
                  />
                </div>
                <div className="leader-connect-field">
                  <label htmlFor="lc-company">Company interested in</label>
                  <input
                    id="lc-company"
                    type="text"
                    required
                    value={companyInterested}
                    onChange={(e) => setCompanyInterested(e.target.value)}
                  />
                </div>
                <div className="leader-connect-field">
                  <label htmlFor="lc-mobile">Mobile number</label>
                  <input
                    id="lc-mobile"
                    type="tel"
                    required
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="10-digit mobile"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                </div>
                <div className="leader-connect-field">
                  <label htmlFor="lc-cv">Attach CV (optional)</label>
                  <input
                    id="lc-cv"
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="leader-connect-hint">PDF, DOC, or DOCX · max 5 MB</p>
                </div>
                <div className="leader-connect-actions">
                  <button type="button" className="landing-btn-secondary landing-btn-lg" onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className="landing-btn-primary landing-btn-lg" disabled={submitting}>
                    {submitting ? "Submitting…" : "Submit request"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
