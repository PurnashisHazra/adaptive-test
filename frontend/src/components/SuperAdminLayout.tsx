import { Link, NavLink, Outlet } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `admin-nav-link${isActive ? " admin-nav-link--active" : ""}`;

export function SuperAdminLayout() {
  return (
    <div className="admin-root">
      <aside className="admin-sidebar" aria-label="Super admin navigation">
        <div className="admin-sidebar-brand">
          Super admin
          <span className="admin-sidebar-brand__sub">Platform control</span>
        </div>
        <nav className="admin-nav">
          <div className="admin-nav-group">
            <NavLink to="/super-admin" end className={linkClass}>
              Users & roles
            </NavLink>
          </div>
        </nav>
        <div className="admin-sidebar-footer">
          <Link to="/admin">← Admin dashboard</Link>
        </div>
      </aside>
      <section className="admin-stage">
        <Outlet />
      </section>
    </div>
  );
}
