import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { listChallengeParticipants } from "../api/client";
import type { ChallengeParticipantBrief } from "../api/types";

function ParticipantLinks({ list }: { list: ChallengeParticipantBrief[] }) {
  if (list.length === 0) {
    return <span style={{ color: "var(--muted)" }}>No participants yet.</span>;
  }
  return (
    <>
      {list.map((p, i) => (
        <span key={`${p.profile_slug}-${i}`}>
          {i > 0 ? ", " : null}
          <Link to={`/u/${encodeURIComponent(p.profile_slug)}`}>{p.display_name}</Link>
          {!p.completed ? <span style={{ color: "var(--muted)" }}> (in progress)</span> : null}
        </span>
      ))}
    </>
  );
}

export function ChallengeParticipants({
  challengeId,
  preview,
  totalCount,
  previewLimit = 8,
}: {
  challengeId: string;
  preview: ChallengeParticipantBrief[];
  totalCount: number;
  previewLimit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fullList, setFullList] = useState<ChallengeParticipantBrief[] | null>(null);

  const hasMore = totalCount > preview.length;
  const showPreviewOnly = !expanded || fullList === null;

  const loadAll = useCallback(async () => {
    if (fullList !== null) {
      setExpanded(true);
      return;
    }
    setLoading(true);
    try {
      const merged: ChallengeParticipantBrief[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const res = await listChallengeParticipants(challengeId, page, 50);
        merged.push(...res.participants);
        totalPages = res.total_pages;
        page += 1;
      }
      setFullList(merged);
      setExpanded(true);
    } catch {
      toast.error("Could not load full participant list");
    } finally {
      setLoading(false);
    }
  }, [challengeId, fullList]);

  if (totalCount === 0) {
    return null;
  }

  const list = showPreviewOnly ? preview : fullList ?? preview;

  return (
    <div style={{ marginTop: "0.65rem" }}>
      <p
        style={{
          margin: "0 0 0.35rem",
          fontSize: "0.8rem",
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Participants ({totalCount})
      </p>
      <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.65 }}>
        <ParticipantLinks list={list} />
      </p>
      {hasMore ? (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: "0.5rem", padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}
          disabled={loading}
          onClick={() => void loadAll()}
        >
          {loading
            ? "Loading…"
            : expanded && fullList
              ? `Showing all ${totalCount} participants`
              : `Show all ${totalCount} participants`}
          {!expanded && preview.length < totalCount ? (
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>
              {" "}
              (preview: {Math.min(preview.length, previewLimit)})
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
