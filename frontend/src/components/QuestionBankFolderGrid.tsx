import type { DifficultyMix } from "../api/types";

const EXAM_LABELS: Record<string, string> = {
  CAT: "CAT",
  SSC: "SSC",
  BANK: "Bank exams",
  RAILWAY: "Railway",
  DEFENCE: "Defence",
  STATE: "State exams",
  OTHER: "Other",
};

export function examTagLabel(tag: string): string {
  const key = tag.trim().toUpperCase();
  return EXAM_LABELS[key] ?? key;
}

export function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function difficultyRows(mix: DifficultyMix) {
  return [
    { key: "EASY", label: "Easy", count: mix.easy, color: "#22c55e" },
    { key: "MEDIUM", label: "Medium", count: mix.medium, color: "#eab308" },
    { key: "HARD", label: "Hard", count: mix.hard, color: "#f97316" },
    { key: "EXPERT", label: "Expert", count: mix.expert, color: "#ef4444" },
  ] as const;
}

export function FolderStatsTooltip({ mix }: { mix: DifficultyMix }) {
  const rows = difficultyRows(mix);
  return (
    <div className="qb-folder__stats" role="tooltip">
      <p className="qb-folder__stats-title">{mix.total.toLocaleString()} question{mix.total === 1 ? "" : "s"}</p>
      <div className="qb-folder__stats-bar">
        {rows.map((row) =>
          row.count > 0 ? (
            <span key={row.key} style={{ flex: row.count, background: row.color }} title={`${row.label}: ${row.count}`} />
          ) : null,
        )}
      </div>
      <ul className="qb-folder__stats-list">
        {rows.map((row) => (
          <li key={row.key}>
            <span className="qb-folder__stats-dot" style={{ background: row.color }} />
            <span>{row.label}</span>
            <span className="qb-folder__stats-pct">{pct(row.count, mix.total)}%</span>
            <span className="qb-folder__stats-count">({row.count.toLocaleString()})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QuestionBankFolderGrid({
  folders,
  onOpen,
}: {
  folders: { id: string; label: string; subtitle?: string; mix: DifficultyMix }[];
  onOpen: (id: string) => void;
}) {
  if (folders.length === 0) {
    return <p className="empty">No folders in this view yet.</p>;
  }

  return (
    <div className="qb-folder-grid">
      {folders.map((folder) => (
        <div key={folder.id} className="qb-folder-wrap">
          <button type="button" className="qb-folder" onClick={() => onOpen(folder.id)}>
            <span className="qb-folder__icon" aria-hidden>
              📁
            </span>
            <span className="qb-folder__body">
              <span className="qb-folder__label">{folder.label}</span>
              {folder.subtitle ? <span className="qb-folder__subtitle">{folder.subtitle}</span> : null}
              <span className="qb-folder__count">
                {folder.mix.total.toLocaleString()} question{folder.mix.total === 1 ? "" : "s"}
              </span>
            </span>
          </button>
          <FolderStatsTooltip mix={folder.mix} />
        </div>
      ))}
    </div>
  );
}
