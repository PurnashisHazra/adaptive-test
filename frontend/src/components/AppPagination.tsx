import { useMemo } from "react";

export function buildPageList(current: number, total: number): Array<number | "gap"> {
  if (total <= 1) return total === 1 ? [1] : [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("gap");
    out.push(sorted[i]);
  }
  return out;
}

export function AppPagination({
  page,
  totalPages,
  total,
  loading,
  onPageChange,
  label = "Pagination",
}: {
  page: number;
  totalPages: number;
  total?: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  const pageList = useMemo(() => buildPageList(page, totalPages), [page, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <nav className="app-pagination" aria-label={label}>
      {total != null ? (
        <span className="app-pagination__meta">
          {total} item{total === 1 ? "" : "s"}
        </span>
      ) : null}
      <div className="app-pagination__controls">
        <button type="button" className="btn btn-ghost" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>
          Previous
        </button>
        {pageList.map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="app-pagination__gap" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`btn ${p === page ? "btn-primary" : "btn-ghost"} app-pagination__page`}
              disabled={loading}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className="btn btn-ghost"
          disabled={page >= totalPages || loading}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
