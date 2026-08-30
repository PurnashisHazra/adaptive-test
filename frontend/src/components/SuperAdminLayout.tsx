import { NavLink, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import "../styles/landing.css";
import "../styles/super-admin-home.css";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `sa-home-tab${isActive ? " sa-home-tab--active" : ""}`;

export function SuperAdminLayout() {
  const role = useAuthStore((s) => s.role);
  const isGod = role === "god";

  return (
    <div className="landing sa-home">
      <div className="sa-home-inner">
        <header className="sa-home-head">
          <p className="landing-kicker">{isGod ? "GOD CONTROL" : "PLATFORM CONTROL"}</p>
          <h1 className="sa-home-title">
            {isGod ? "God" : "Super admin"}
            <span className="landing-headline-outline">command center</span>
          </h1>
          <p className="landing-subhead">
            {isGod
              ? "Assign every role, use the instructor console, and CRUD the live database."
              : "Assign roles, admin codes, and quotas — then watch users, attempts, and confirmed UPI revenue in one place."}
          </p>
          <nav className="sa-home-tabs" aria-label="Platform sections">
            <NavLink to="/super-admin" end className={tabClass}>
              Users & roles
            </NavLink>
            <NavLink to="/super-admin/metrics" className={tabClass}>
              Metrics
            </NavLink>
            {isGod ? (
              <>
                <NavLink to="/admin" className={tabClass}>
                  Instructor admin
                </NavLink>
                <NavLink to="/super-admin/database" className={tabClass}>
                  Database
                </NavLink>
              </>
            ) : null}
          </nav>
        </header>
        <div className="sa-home-stage">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
