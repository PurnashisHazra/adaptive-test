import { NavLink, Outlet } from "react-router-dom";
import "../styles/landing.css";
import "../styles/super-admin-home.css";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `sa-home-tab${isActive ? " sa-home-tab--active" : ""}`;

export function SuperAdminLayout() {
  return (
    <div className="landing sa-home">
      <div className="sa-home-inner">
        <header className="sa-home-head">
          <p className="landing-kicker">PLATFORM CONTROL</p>
          <h1 className="sa-home-title">
            Super admin
            <span className="landing-headline-outline">command center</span>
          </h1>
          <p className="landing-subhead">
            Assign roles, admin codes, and quotas — then watch users, attempts, and confirmed UPI revenue in one place.
          </p>
          <nav className="sa-home-tabs" aria-label="Super admin sections">
            <NavLink to="/super-admin" end className={tabClass}>
              Users & roles
            </NavLink>
            <NavLink to="/super-admin/metrics" className={tabClass}>
              Metrics
            </NavLink>
          </nav>
        </header>
        <div className="sa-home-stage">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
