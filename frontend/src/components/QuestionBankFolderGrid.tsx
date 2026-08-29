import type { DifficultyMix } from "../api/types";

const EXAM_LABELS: Record<string, string> = {
  CAT: "CAT",
  SSC: "SSC",
  BANK: "Bank exams",
  RAILWAY: "Railway",
  DEFENCE: "Defence",
  STATE: "State exams",
  OTHER: "Other",
  OTHERS: "Others",
};

export function examTagLabel(tag: string, displayName?: string | null): string {
  if (displayName?.trim()) return displayName.trim();
  const key = tag.trim().toUpperCase();
  return EXAM_LABELS[key] ?? key;
}

export function subjectFolderLabel(subject: string, displayName?: string | null): string {
  return displayName?.trim() || subject;
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

function FolderIcon() {
  return (
    <svg className="qb-folder__icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v9A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5v-11Z"
        fill="#fbbf24"
        stroke="#d97706"
        strokeWidth="1.2"
      />
      <path d="M3 9h18" stroke="#d97706" strokeWidth="1.2" />
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <path
        d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13.5 6.5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 7V5h6v2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path
        d="M7 7l1 13h8l1-13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
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

function MoveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <path
        d="M5 9h12M5 9l3-3M5 9l3 3M19 15H7M19 15l-3-3M19 15l-3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function QuestionBankFolderGrid({
  folders,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onCopy,
  onUse,
  selectedIds,
  onToggleSelect,
}: {
  folders: { id: string; label: string; subtitle?: string; mix: DifficultyMix }[];
  onOpen: (id: string) => void;
  onRename?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string) => void;
  onCopy?: (id: string) => void;
  onUse?: (id: string) => void;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}) {
  if (folders.length === 0) {
    return <p className="empty">No folders in this view yet.</p>;
  }

  const hasActions = Boolean(onRename || onDelete || onMove || onCopy || onUse);
  const selectable = Boolean(onToggleSelect && selectedIds);

  return (
    <div className="qb-folder-grid">
      {folders.map((folder) => {
        const selected = selectedIds?.includes(folder.id) ?? false;
        return (
        <div key={folder.id} className={`qb-folder-wrap${selected ? " qb-folder-wrap--selected" : ""}`}>
          <div className="qb-folder-card">
            {selectable ? (
              <label className="qb-folder__select">
                <input
                  type="checkbox"
                  aria-label={`Select ${folder.label}`}
                  checked={selected}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleSelect?.(folder.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
            ) : null}
            <button type="button" className="qb-folder" onClick={() => onOpen(folder.id)}>
              <FolderIcon />
              <span className="qb-folder__body">
                <span className="qb-folder__label">{folder.label}</span>
                {folder.subtitle ? <span className="qb-folder__subtitle">{folder.subtitle}</span> : null}
                <span className="qb-folder__count">
                  {folder.mix.total.toLocaleString()} question{folder.mix.total === 1 ? "" : "s"}
                </span>
              </span>
            </button>
            {hasActions ? (
              <div className="qb-folder__toolbar">
                {onUse ? (
                  <button
                    type="button"
                    className="qb-folder__use-btn"
                    title={`Use ${folder.label}`}
                    aria-label={`Use ${folder.label}`}
                    disabled={folder.mix.total <= 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUse(folder.id);
                    }}
                  >
                    Use
                  </button>
                ) : null}
                {onMove ? (
                  <button
                    type="button"
                    className="qb-folder__icon-btn"
                    title="Move folder"
                    aria-label={`Move ${folder.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(folder.id);
                    }}
                  >
                    <MoveIcon />
                  </button>
                ) : null}
                {onCopy ? (
                  <button
                    type="button"
                    className="qb-folder__icon-btn"
                    title="Copy folder"
                    aria-label={`Copy ${folder.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy(folder.id);
                    }}
                  >
                    <CopyIcon />
                  </button>
                ) : null}
                {onRename ? (
                  <button
                    type="button"
                    className="qb-folder__icon-btn"
                    title="Rename"
                    aria-label={`Rename ${folder.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRename(folder.id);
                    }}
                  >
                    <RenameIcon />
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    className="qb-folder__icon-btn qb-folder__icon-btn--danger"
                    title="Delete"
                    aria-label={`Delete ${folder.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(folder.id);
                    }}
                  >
                    <DeleteIcon />
                  </button>
                ) : null}
              </div>
            ) : null}
            <FolderStatsTooltip mix={folder.mix} />
          </div>
        </div>
      );
      })}
    </div>
  );
}
