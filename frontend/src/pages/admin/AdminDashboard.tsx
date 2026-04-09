import { Link } from "react-router-dom";
import { AdminPanel } from "../../components/AdminPanel";

const tiles = [
  { to: "/admin/questions", title: "Question bank", desc: "Create, edit, filter, and delete items." },
  { to: "/admin/question-papers", title: "Question papers", desc: "Multi-section papers, marking, assign to students." },
  { to: "/admin/upload", title: "Bulk upload", desc: "Import CSV or JSON with validation." },
  { to: "/admin/analytics", title: "Analytics", desc: "Accuracy, topics, and top performers." },
  { to: "/admin/reports", title: "Reports & queries", desc: "Student-reported question issues." },
  { to: "/admin/settings", title: "Settings", desc: "Difficulty waves and transition map." },
  { to: "/admin/attempts", title: "Attempts", desc: "Recent sessions and exports." },
];

export function AdminDashboard() {
  return (
    <AdminPanel title="Overview">
      <p style={{ color: "var(--muted)", maxWidth: 640, marginTop: 0 }}>
        Manage content and monitor learning signals. Use the sidebar to switch areas; each screen has filters where it helps narrow the data.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "1rem",
          marginTop: "1.25rem",
        }}
      >
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <h3 style={{ marginBottom: "0.35rem" }}>{t.title}</h3>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.95rem" }}>{t.desc}</p>
          </Link>
        ))}
      </div>
    </AdminPanel>
  );
}
