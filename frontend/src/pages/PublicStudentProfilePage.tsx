import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicStudentProfile } from "../api/client";
import type { PublicProfile } from "../api/types";
import { AppPage } from "../components/AppPage";

export function PublicStudentProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    getPublicStudentProfile(slug)
      .then(setProfile)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <AppPage narrow title="Public profile">
        <p style={{ color: "var(--muted)" }}>Loading profile…</p>
      </AppPage>
    );
  }

  if (notFound || !profile) {
    return (
      <AppPage narrow title="Profile not found">
        <div className="card" style={{ textAlign: "center" }}>
          <p style={{ color: "var(--muted)" }}>
            <Link to="/">Back to challenges</Link>
          </p>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage narrow title={profile.display_name} lead={`@${profile.profile_slug}`}>
      <nav className="app-page-nav">
        <Link to="/" className="app-page-nav__link">
          ← Challenges
        </Link>
      </nav>
      <div className="card">
        {profile.bio ? (
          <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{profile.bio}</p>
        ) : (
          <p style={{ margin: 0, color: "var(--muted)" }}>No bio yet.</p>
        )}
      </div>
    </AppPage>
  );
}
