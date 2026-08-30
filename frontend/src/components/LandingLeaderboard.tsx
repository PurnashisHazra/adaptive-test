import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { HomepageLeaderboard, LeaderboardEntry } from "../api/types";

type BoardKey = "most_challenges" | "highest_scores" | "new_signups";

const TABS: { id: BoardKey; label: string }[] = [
  { id: "most_challenges", label: "Most challenges" },
  { id: "highest_scores", label: "Highest scores" },
  { id: "new_signups", label: "New signups" },
];

function BoardList({ rows, empty }: { rows: LeaderboardEntry[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="landing-board-empty">{empty}</p>;
  }
  return (
    <ol className="landing-board-list">
      {rows.map((row) => (
        <li key={`${row.rank}-${row.profile_slug}`} className="landing-board-row">
          <span className="landing-board-rank" aria-hidden>
            {row.rank}
          </span>
          <Link to={`/u/${encodeURIComponent(row.profile_slug)}`} className="landing-board-name">
            {row.display_name}
          </Link>
          <span className="landing-board-metric">{row.metric}</span>
        </li>
      ))}
    </ol>
  );
}

function PrizeName({ entry }: { entry: { display_name: string; profile_slug: string } }) {
  return (
    <Link to={`/u/${encodeURIComponent(entry.profile_slug)}`} className="landing-board-prize-name">
      {entry.display_name}
    </Link>
  );
}

function ExamIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <path d="M8 3h8a2 2 0 0 1 2 2v14l-3-1.5L12 19l-3-1.5L6 19V5a2 2 0 0 1 2-2Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
      <path d="M4 5.5v16A2.5 2.5 0 0 1 6.5 19H20" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 9.2c.6-.7 1.5-1.1 2.5-1.1 1.6 0 2.7 1 2.7 2.4 0 3.2-5.4 1.6-5.4 4.2 0 1.4 1.2 2.4 2.8 2.4 1.1 0 2-.4 2.6-1.1" />
    </svg>
  );
}

export function LandingLeaderboard({ data, loading }: { data: HomepageLeaderboard | null; loading: boolean }) {
  const [tab, setTab] = useState<BoardKey>("most_challenges");

  useEffect(() => {
    if (!data) return;
    if (data.most_challenges.length > 0) setTab("most_challenges");
    else if (data.highest_scores.length > 0) setTab("highest_scores");
    else if (data.new_signups.length > 0) setTab("new_signups");
  }, [data]);

  const rows = data ? data[tab] : [];
  const empty =
    tab === "most_challenges"
      ? "No challenge attempts yet."
      : tab === "highest_scores"
        ? "No scores yet."
        : "No new students yet.";

  const named = [...(data?.highest_scores ?? []), ...(data?.most_challenges ?? [])].filter(
    (row, index, all) => all.findIndex((item) => item.profile_slug === row.profile_slug) === index,
  );
  const prizeOne = named[0] ?? null;
  const prizeTwo = named[1] ?? named[0] ?? null;

  return (
    <aside className="landing-board" aria-label="Student leaderboard">
      <p className="landing-topper-kicker">Leaderboard</p>
      <div className="landing-board-tabs" role="tablist" aria-label="Leaderboard views">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`landing-board-tab${tab === item.id ? " is-active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {loading ? <p className="landing-board-empty">Loading leaders…</p> : <BoardList rows={rows} empty={empty} />}
      <div className="landing-board-prizes">
        {prizeOne ? (
          <p className="landing-board-prize">
            <span className="landing-board-prize-icon" aria-hidden>
              <ExamIcon />
            </span>
            <span>
              <PrizeName entry={prizeOne} /> won 2 free CAT mock tests (from top institutes)
            </span>
          </p>
        ) : null}
        {prizeTwo ? (
          <p className="landing-board-prize">
            <span className="landing-board-prize-icon" aria-hidden>
              <BookIcon />
            </span>
            <span>
              <PrizeName entry={prizeTwo} /> won INR 200 discount on Arun Sharma books.
            </span>
          </p>
        ) : null}
        <Link to="/challenges" className="landing-board-prize landing-board-prize--cta">
          <span className="landing-board-prize-icon" aria-hidden>
            <CoinIcon />
          </span>
          <span>Score high on challenges and get ur discount now!</span>
        </Link>
      </div>
    </aside>
  );
}
