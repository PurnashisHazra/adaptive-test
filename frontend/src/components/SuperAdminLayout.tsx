import { NavLink, Outlet } from "react-router-dom";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `admin-nav-link${isActive ? " admin-nav-link--active" : ""}`;

export function SuperAdminLayout() {
  return (
    <div className="admin-root">
      <aside className="admin-sidebar" aria-label="Super admin navigation">
        <div className="admin-sidebar-brand">Super admin</div>
        <nav className="admin-nav">
          <NavLink to="/super-admin" end className={linkClass}>
            Users & roles
          </NavLink>
        </nav>
      </aside>
      <section className="admin-stage">
        <Outlet />
      </section>
    </div>
  );
}
