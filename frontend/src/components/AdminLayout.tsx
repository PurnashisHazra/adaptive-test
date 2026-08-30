import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `admin-nav-link${isActive ? " admin-nav-link--active" : ""}`;

const navGroups: { label: string; items: { to: string; end?: boolean; label: string }[] }[] = [
  {
    label: "Home",
    items: [{ to: "/admin", end: true, label: "Overview" }],
  },
  {
    label: "Content",
    items: [
      { to: "/admin/questions", label: "Questions" },
      { to: "/admin/rc-sets", label: "RC sets" },
      { to: "/admin/question-papers", label: "Papers" },
      { to: "/admin/challenges", label: "Challenges" },
      { to: "/admin/upload", label: "Bulk upload" },
    ],
  },
  {
    label: "Students",
    items: [
      { to: "/admin/students", label: "Student controls" },
      { to: "/admin/student-reports", label: "Student reports" },
      { to: "/admin/attempts", label: "Attempts" },
    ],
  },
  {
    label: "Payments & leads",
    items: [
      { to: "/admin/mentorship-bookings", label: "Mentorship payments" },
      { to: "/admin/paper-unlocks", label: "Paper unlocks" },
      { to: "/admin/consultation-requests", label: "Consultations" },
      { to: "/admin/leader-connect", label: "Leader connect" },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/admin/analytics", label: "Analytics" },
      { to: "/admin/reports", label: "Reports" },
      { to: "/admin/settings", label: "Settings" },
    ],
  },
];

export function AdminLayout() {
  const role = useAuthStore((s) => s.role);
  const isGod = role === "god";

  return (
    <div className="admin-root">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-sidebar-brand">
          {isGod ? "AdapTest God" : "AdapTest Admin"}
          <span className="admin-sidebar-brand__sub">
            {isGod ? "Full instructor console" : "Instructor dashboard"}
          </span>
        </div>
        <nav className="admin-nav">
          {navGroups.map((group) => (
            <div key={group.label} className="admin-nav-group">
              <div className="admin-nav-group__label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          {isGod ? <Link to="/super-admin">← God command center</Link> : null}
          <Link to="/">← Back to site</Link>
        </div>
      </aside>
      <section className="admin-stage">
        <Outlet />
      </section>
    </div>
  );
}
