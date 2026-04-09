import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AdminPanel } from "../../components/AdminPanel";
import { getConfig, patchConfig } from "../../api/client";
import type { AppConfig, Difficulty } from "../../api/types";

const LEVELS: Difficulty[] = ["EASY", "MEDIUM", "HARD", "EXPERT"];

export function SettingsPage() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [transitions, setTransitions] = useState<Record<Difficulty, { if_correct: Difficulty; if_wrong: Difficulty }>>({
    EASY: { if_correct: "MEDIUM", if_wrong: "EASY" },
    MEDIUM: { if_correct: "HARD", if_wrong: "EASY" },
    HARD: { if_correct: "EXPERT", if_wrong: "MEDIUM" },
    EXPERT: { if_correct: "EXPERT", if_wrong: "HARD" },
  });

  useEffect(() => {
    getConfig()
      .then((c) => {
        setCfg(c);
        setTransitionEnabled(Boolean(c.difficulty_transition_enabled));
        if (c.difficulty_transition_map) {
          setTransitions((prev) => ({
            ...prev,
            EASY: { ...prev.EASY, ...(c.difficulty_transition_map.EASY ?? {}) },
            MEDIUM: { ...prev.MEDIUM, ...(c.difficulty_transition_map.MEDIUM ?? {}) },
            HARD: { ...prev.HARD, ...(c.difficulty_transition_map.HARD ?? {}) },
            EXPERT: { ...prev.EXPERT, ...(c.difficulty_transition_map.EXPERT ?? {}) },
          }));
        }
      })
      .catch(() => toast.error("Failed to load settings"));
  }, []);

  const correctPath = useMemo(() => {
    const out: Difficulty[] = ["EASY"];
    for (let i = 0; i < 7; i++) {
      const cur = out[out.length - 1];
      out.push(transitions[cur]?.if_correct ?? cur);
    }
    return out;
  }, [transitions]);

  const wrongPath = useMemo(() => {
    const out: Difficulty[] = ["EASY"];
    for (let i = 0; i < 7; i++) {
      const cur = out[out.length - 1];
      out.push(transitions[cur]?.if_wrong ?? cur);
    }
    return out;
  }, [transitions]);

  async function onSave() {
    setSaving(true);
    try {
      const next = await patchConfig({
        difficulty_transition_enabled: transitionEnabled,
        difficulty_transition_map: transitions,
      });
      setCfg(next);
      toast.success("Settings saved");
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail : undefined;
      toast.error(typeof msg === "string" ? msg : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPanel
      title="Settings"
      actions={
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      }
    >
      <p style={{ color: "var(--muted)", maxWidth: 780, marginTop: 0 }}>
        Configure branching difficulty transitions. For each current difficulty, set the next difficulty for both outcomes: correct or wrong.
      </p>

      <div className="card" style={{ marginTop: "1rem", maxWidth: 980 }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
          <input type="checkbox" checked={transitionEnabled} onChange={(e) => setTransitionEnabled(e.target.checked)} />
          <span>Enable custom branching transitions</span>
        </label>

        <div style={{ marginTop: "0.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
          {LEVELS.map((cur) => (
            <div key={cur} className="card" style={{ margin: 0, padding: "0.8rem" }}>
              <div style={{ marginBottom: "0.45rem" }}>
                <strong>Current: </strong>
                <span className="badge">{cur}</span>
              </div>
              <div style={{ marginBottom: "0.5rem" }}>
                <label className="label">If correct</label>
                <select
                  className="input"
                  value={transitions[cur].if_correct}
                  onChange={(e) => {
                    const v = e.target.value as Difficulty;
                    setTransitions((t) => ({ ...t, [cur]: { ...t[cur], if_correct: v } }));
                  }}
                >
                  {LEVELS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">If wrong</label>
                <select
                  className="input"
                  value={transitions[cur].if_wrong}
                  onChange={(e) => {
                    const v = e.target.value as Difficulty;
                    setTransitions((t) => ({ ...t, [cur]: { ...t[cur], if_wrong: v } }));
                  }}
                >
                  {LEVELS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "1rem", color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.7 }}>
          Correct-path preview: <code>{correctPath.join(" -> ")}</code>
          <br />
          Wrong-path preview: <code>{wrongPath.join(" -> ")}</code>
        </div>

        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          {cfg && (
            <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              Current mode: {cfg.difficulty_transition_enabled ? "Branching transitions enabled" : "Default adaptive"}
            </span>
          )}
        </div>
      </div>
    </AdminPanel>
  );
}

