import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  createGodDocument,
  deleteGodDocument,
  getGodDocument,
  listGodCollections,
  listGodDocuments,
  replaceGodDocument,
} from "../../api/client";
import type { GodCollectionInfo, GodDocumentPage } from "../../api/types";

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function GodDatabasePage() {
  const [collections, setCollections] = useState<GodCollectionInfo[]>([]);
  const [active, setActive] = useState<string>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<GodDocumentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<string>("{\n  \n}");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCollections = useCallback(async () => {
    try {
      const rows = await listGodCollections();
      setCollections(rows);
      setActive((cur) => cur || rows[0]?.name || "");
    } catch {
      toast.error("Could not list collections");
    }
  }, []);

  const loadDocs = useCallback(async (collection: string, nextPage: number) => {
    if (!collection) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData(await listGodDocuments(collection, nextPage, 20));
    } catch {
      toast.error("Could not load documents");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    void loadDocs(active, page);
  }, [active, page, loadDocs]);

  async function onSelect(name: string) {
    setActive(name);
    setPage(1);
    setEditingId(null);
    setEditor("{\n  \n}");
  }

  async function onEdit(id: string) {
    setBusy(true);
    try {
      const doc = await getGodDocument(active, id);
      setEditingId(id);
      setEditor(pretty(doc));
    } catch {
      toast.error("Could not open document");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editor) as Record<string, unknown>;
    } catch {
      toast.error("JSON is invalid");
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await replaceGodDocument(active, editingId, parsed);
        toast.success("Document updated");
      } else {
        await createGodDocument(active, parsed);
        toast.success("Document created");
      }
      setEditingId(null);
      setEditor("{\n  \n}");
      await loadCollections();
      await loadDocs(active, page);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm(`Delete document ${id} from ${active}?`)) return;
    setBusy(true);
    try {
      await deleteGodDocument(active, id);
      toast.success("Deleted");
      if (editingId === id) {
        setEditingId(null);
        setEditor("{\n  \n}");
      }
      await loadCollections();
      await loadDocs(active, page);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      toast.error(typeof msg === "string" ? msg : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="god-db">
      <p className="sa-page-lead">
        Full database access. Edit JSON carefully — password hashes are redacted on read and kept if you leave the
        redacted value in place.
      </p>
      <div className="god-db-grid">
        <aside className="god-db-cols" aria-label="Collections">
          {collections.map((col) => (
            <button
              key={col.name}
              type="button"
              className={`god-db-col${active === col.name ? " is-active" : ""}`}
              onClick={() => void onSelect(col.name)}
            >
              <span>{col.name}</span>
              <span className="god-db-count">{col.estimated_count}</span>
            </button>
          ))}
        </aside>
        <div className="god-db-main">
          <div className="god-db-toolbar">
            <strong>{active || "No collection"}</strong>
            <span>
              {data ? `${data.total} documents` : ""}
            </span>
            <button type="button" className="landing-btn-secondary" onClick={() => void loadDocs(active, page)} disabled={loading}>
              Refresh
            </button>
          </div>
          {loading ? (
            <div className="skeleton sa-skeleton">Loading documents…</div>
          ) : (
            <ul className="god-db-list">
              {(data?.documents ?? []).map((doc) => {
                const id = String(doc._id ?? "");
                return (
                  <li key={id || pretty(doc).slice(0, 40)} className="god-db-row">
                    <pre>{pretty(doc)}</pre>
                    <div className="god-db-row-actions">
                      <button type="button" className="landing-btn-secondary" onClick={() => void onEdit(id)} disabled={!id || busy}>
                        Edit
                      </button>
                      <button type="button" className="landing-btn-secondary" onClick={() => void onDelete(id)} disabled={!id || busy}>
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {data && data.total > data.page_size ? (
            <div className="god-db-pager">
              <button type="button" className="landing-btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className="landing-btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
          <div className="god-db-editor">
            <label className="label">{editingId ? `Edit ${editingId}` : "Create document"}</label>
            <textarea
              className="input god-db-json"
              value={editor}
              onChange={(e) => setEditor(e.target.value)}
              spellCheck={false}
            />
            <div className="god-db-row-actions">
              <button type="button" className="landing-btn-primary" onClick={() => void onSave()} disabled={busy || !active}>
                {editingId ? "Save changes" : "Insert document"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="landing-btn-secondary"
                  onClick={() => {
                    setEditingId(null);
                    setEditor("{\n  \n}");
                  }}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
