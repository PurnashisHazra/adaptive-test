import { NavLink, Outlet } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `admin-nav-link${isActive ? " admin-nav-link--active" : ""}`;

const items: { to: string; end?: boolean; label: string }[] = [
  { to: "/admin", end: true, label: "Overview" },
  { to: "/admin/questions", label: "Questions" },
  { to: "/admin/question-papers", label: "Papers" },
  { to: "/admin/challenges", label: "Challenges" },
  { to: "/admin/students", label: "Student controls" },
  { to: "/admin/student-reports", label: "Student reports" },
  { to: "/admin/upload", label: "Bulk upload" },
  { to: "/admin/analytics", label: "Analytics" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/attempts", label: "Attempts" },
  { to: "/admin/settings", label: "Settings" },
];

export function AdminLayout() {
  return (
    <div className="admin-root">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div className="admin-sidebar-brand">Dashboard</div>
        <nav className="admin-nav">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="admin-stage">
        <Outlet />
      </section>
    </div>
  );
}
