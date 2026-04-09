import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AdminPanel } from "../../components/AdminPanel";
import { importQuestionsCsv, importQuestionsJson } from "../../api/client";

export function BulkUploadPage() {
  const [result, setResult] = useState<Awaited<ReturnType<typeof importQuestionsCsv>> | null>(null);

  async function onCsv(file: File | null) {
    if (!file) return;
    try {
      const r = await importQuestionsCsv(file);
      setResult(r);
      toast.success(`Inserted ${r.inserted}, skipped ${r.skipped}`);
    } catch {
      toast.error("Import failed");
    }
  }

  async function onJson(file: File | null) {
    if (!file) return;
    try {
      const r = await importQuestionsJson(file);
      setResult(r);
      toast.success(`Inserted ${r.inserted}, skipped ${r.skipped}`);
    } catch {
      toast.error("Import failed");
    }
  }

  return (
    <AdminPanel
      title="Bulk upload"
      actions={
        <Link to="/admin/questions" className="btn btn-ghost">
          Open question bank
        </Link>
      }
    >
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Upload a CSV with headers matching the template, or a JSON file with a top-level questions array.
      </p>

      <div className="card" style={{ marginTop: "1.25rem", maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>CSV</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
          Columns: question_text, question_type (mcq_single, true_false, or tita / type_in / short_answer / fill_in), option_a–d (leave blank for TITA), correct_answer, difficulty, subject, topic, tags, explanation
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onCsv(e.target.files?.[0] ?? null)} />
      </div>

      <div className="card" style={{ marginTop: "1rem", maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>JSON</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Format: {"{ \"questions\": [ { ...QuestionCreate } ] }"}</p>
        <input type="file" accept=".json,application/json" onChange={(e) => onJson(e.target.files?.[0] ?? null)} />
      </div>

      {result && (
        <div className="card" style={{ marginTop: "1rem", maxWidth: 720 }}>
          <h3 style={{ marginTop: 0 }}>Last result</h3>
          <p>
            Inserted: {result.inserted} · Skipped (duplicates): {result.skipped}
          </p>
          {result.errors.length > 0 && (
            <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i}>
                      <td>{e.row}</td>
                      <td>{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </AdminPanel>
  );
}
