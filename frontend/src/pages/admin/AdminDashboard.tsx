import { Link } from "react-router-dom";
import { AdminPanel } from "../../components/AdminPanel";

const tiles = [
  { to: "/admin/questions", title: "Question bank", desc: "Create, edit, filter, and delete items." },
  { to: "/admin/rc-sets", title: "RC sets", desc: "Reading passages with linked sub-questions for verbal sections." },
  { to: "/admin/question-papers", title: "Question papers", desc: "Multi-section papers, marking, assign to students." },
  { to: "/admin/challenges", title: "Challenges", desc: "Scheduled contests with launch/end windows and platform-wide access." },
  { to: "/admin/mentorship-bookings", title: "Mentorship payments", desc: "Approve ₹100 topper session UPI payments." },
  { to: "/admin/paper-unlocks", title: "Paper unlock payments", desc: "Approve ₹100 mock-test unlocks from the landing page." },
  { to: "/admin/consultation-requests", title: "Free consultations", desc: "Career consultation signup requests from the landing page." },
  { to: "/admin/leader-connect", title: "Leader connect", desc: "Review alumni connect requests from the landing page." },
  { to: "/admin/students", title: "Student controls", desc: "Papers, practice limits, exam types, and access blocks." },
  { to: "/admin/student-reports", title: "Student report cards", desc: "List students and open strategy report cards as PDF." },
  { to: "/admin/upload", title: "Bulk upload", desc: "Import CSV or JSON with validation." },
  { to: "/admin/analytics", title: "Analytics", desc: "Accuracy, topics, and top performers." },
  { to: "/admin/reports", title: "Reports & queries", desc: "Student-reported question issues." },
  { to: "/admin/settings", title: "Settings", desc: "Difficulty waves and transition map." },
  { to: "/admin/attempts", title: "Attempts", desc: "Recent sessions and exports." },
];

export function AdminDashboard() {
  return (
    <AdminPanel
      title="Overview"
      lead="Manage content and monitor learning signals. Use the sidebar to switch areas; each screen has filters where it helps narrow the data."
    >
      <div className="app-tile-grid">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="card">
            <h3>{t.title}</h3>
            <p>{t.desc}</p>
          </Link>
        ))}
      </div>
    </AdminPanel>
  );
}
