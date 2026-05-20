import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicStudentProfile } from "../api/client";
import type { PublicProfile } from "../api/types";

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
      <div className="page">
        <p style={{ color: "var(--muted)" }}>Loading profile…</p>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 0.5rem" }}>Profile not found</h2>
          <p style={{ color: "var(--muted)" }}>
            <Link to="/">Back to challenges</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <p style={{ margin: "0 0 1rem" }}>
          <Link to="/">← Challenges</Link>
        </p>
        <div className="card">
          <h1 style={{ margin: "0 0 0.5rem" }}>{profile.display_name}</h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}>@{profile.profile_slug}</p>
          {profile.bio ? (
            <p style={{ margin: "1.25rem 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{profile.bio}</p>
          ) : (
            <p style={{ margin: "1.25rem 0 0", color: "var(--muted)" }}>No bio yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
