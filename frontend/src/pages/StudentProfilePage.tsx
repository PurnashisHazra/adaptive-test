import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getMyAccount, getMyPublicProfile, updateMyAccount, updateMyPublicProfile } from "../api/client";
import type { PublicProfile, StudentAccount } from "../api/types";
import { useAuthStore } from "../store/authStore";
import { AppPage } from "../components/AppPage";
import { PageLoading } from "../components/AppPageStates";

function normalizeMobileInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

function normalizeSlugInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function StudentProfilePage() {
  const claimAdminCodeUser = useAuthStore((s) => s.claimAdminCodeUser);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const needsAdminCode = useAuthStore((s) => s.needsAdminCode);

  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobile, setMobile] = useState("");
  const [savingMobile, setSavingMobile] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [linkingCode, setLinkingCode] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [profileSlug, setProfileSlug] = useState("");
  const [bio, setBio] = useState("");
  const [savingPublic, setSavingPublic] = useState(false);

  useEffect(() => {
    Promise.all([getMyAccount(), getMyPublicProfile()])
      .then(([a, p]) => {
        setAccount(a);
        setMobile(a.mobile ?? "");
        setPublicProfile(p);
        setDisplayName(p.display_name);
        setProfileSlug(p.profile_slug);
        setBio(p.bio ?? "");
      })
      .catch(() => toast.error("Could not load profile"))
      .finally(() => setLoading(false));
  }, []);

  async function onSaveMobile(e: FormEvent) {
    e.preventDefault();
    const digits = normalizeMobileInput(mobile);
    if (digits.length < 10) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setSavingMobile(true);
    try {
      const updated = await updateMyAccount({ mobile: digits });
      setAccount(updated);
      setMobile(updated.mobile ?? digits);
      await refreshMe();
      toast.success("Mobile number saved");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not save mobile");
    } finally {
      setSavingMobile(false);
    }
  }

  async function onSavePublicProfile(e: FormEvent) {
    e.preventDefault();
    const slug = normalizeSlugInput(profileSlug);
    if (slug.length < 2) {
      toast.error("Profile URL must be at least 2 characters");
      return;
    }
    if (!displayName.trim()) {
      toast.error("Display name is required");
      return;
    }
    setSavingPublic(true);
    try {
      const updated = await updateMyPublicProfile({
        profile_slug: slug,
        display_name: displayName.trim(),
        bio: bio.trim(),
      });
      setPublicProfile(updated);
      setProfileSlug(updated.profile_slug);
      setDisplayName(updated.display_name);
      setBio(updated.bio ?? "");
      toast.success("Public profile saved");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Could not save public profile");
    } finally {
      setSavingPublic(false);
    }
  }

  async function onLinkAdminCode(e: FormEvent) {
    e.preventDefault();
    if (!adminCode.trim()) {
      toast.error("Enter your instructor admin code");
      return;
    }
    setLinkingCode(true);
    try {
      const res = await claimAdminCodeUser(adminCode.trim());
      if (!res.ok) {
        toast.error(res.error ?? "Invalid admin code");
        return;
      }
      const updated = await getMyAccount();
      setAccount(updated);
      setAdminCode("");
      toast.success("Linked to your instructor");
    } finally {
      setLinkingCode(false);
    }
  }

  const publicUrl = publicProfile ? `/u/${encodeURIComponent(publicProfile.profile_slug)}` : null;

  if (loading) {
    return (
      <AppPage panel showSubNav title="Profile" lead="Loading your account settings…">
        <PageLoading label="Loading profile…" />
      </AppPage>
    );
  }

  return (
    <AppPage
      panel
      showSubNav
      title="Profile"
      lead="Private account settings and your public profile for challenge leaderboards."
    >
      <div className="student-profile-layout">
      <form onSubmit={onSavePublicProfile} className="card app-form-card student-profile-section student-profile-section--wide">
        <h3>Public profile</h3>
        <p className="app-form-card__intro">Anyone can view this page. Your name appears on challenges you attempt.</p>
        {publicUrl ? (
          <p style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
            <Link to={publicUrl}>View public profile →</Link>
          </p>
        ) : null}
        <div className="student-form-field">
          <label className="label" htmlFor="profile-display-name">
            Display name
          </label>
          <input
            id="profile-display-name"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="student-form-field">
          <label className="label" htmlFor="profile-slug">
            Profile URL
          </label>
          <div className="student-form-slug">
            <span className="student-form-slug__prefix">/u/</span>
            <input
              id="profile-slug"
              className="input"
              value={profileSlug}
              onChange={(e) => setProfileSlug(normalizeSlugInput(e.target.value))}
              maxLength={64}
              required
            />
          </div>
        </div>
        <div className="student-form-field">
          <label className="label" htmlFor="profile-bio">
            Bio
          </label>
          <textarea
            id="profile-bio"
            className="input"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short intro for your public profile"
            maxLength={1000}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={savingPublic}>
          {savingPublic ? "Saving…" : "Save public profile"}
        </button>
      </form>

      <div className="card app-form-card student-profile-section">
        <h3>Account</h3>
        <p className="app-card-subtitle">Login username</p>
        <p className="student-profile-readonly">{account?.username}</p>
      </div>

      <form onSubmit={onSaveMobile} className="card app-form-card student-profile-section">
        <h3>Mobile number</h3>
        <p className="app-form-card__intro">Required to unlock advanced strategy insights on the Performance page.</p>
        <div className="student-form-field">
          <label className="label" htmlFor="profile-mobile">
            Mobile
          </label>
          <input
            id="profile-mobile"
            className="input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={mobile}
            onChange={(e) => setMobile(normalizeMobileInput(e.target.value))}
            placeholder="10-digit mobile number"
            maxLength={15}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={savingMobile}>
          {savingMobile ? "Saving…" : "Save mobile"}
        </button>
      </form>

      <div className="card app-form-card student-profile-section">
        <h3>Instructor admin code</h3>
        {account?.assigned_admin_code ? (
          <p style={{ margin: 0 }}>
            Linked to instructor code: <strong>{account.assigned_admin_code}</strong>
          </p>
        ) : (
          <>
            <p className="app-form-card__intro">
              Optional — link your instructor to unlock practice tests and assigned papers. Challenges, Analytics, and
              Performance do not require a code.
            </p>
            <form onSubmit={onLinkAdminCode}>
              <div className="student-form-field">
                <label className="label" htmlFor="profile-admin-code">
                  Admin code
                </label>
                <input
                  id="profile-admin-code"
                  className="input"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3"
                  autoComplete="off"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={linkingCode} style={{ width: "100%" }}>
                {linkingCode ? "Verifying…" : "Link instructor"}
              </button>
            </form>
          </>
        )}
        {needsAdminCode ? (
          <p style={{ margin: "1rem 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
            Practice tests and papers require an instructor code. <Link to="/challenges">Mock Tests</Link>,{" "}
            <Link to="/review">Analytics</Link>, and <Link to="/performance">Performance</Link> do not.
          </p>
        ) : null}
      </div>
      </div>
    </AppPage>
  );
}
