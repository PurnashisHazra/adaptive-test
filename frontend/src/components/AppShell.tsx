import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  fontWeight: isActive ? 600 : 500,
  color: isActive ? "#0f172a" : "#64748b",
  textDecoration: "none",
  padding: "0.35rem 0.65rem",
  borderRadius: 8,
  background: isActive ? "rgba(14,165,233,0.12)" : "transparent",
  flexShrink: 0,
});

export function AppShell() {
  const { pathname } = useLocation();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const isStudent = role === "student";
  const isAdmin = role === "admin";
  const isSuperAdmin = role === "super_admin";
  const isStaff = isAdmin || isSuperAdmin;
  const isAdminSection = pathname.startsWith("/admin") || pathname.startsWith("/super-admin");
  const homeTo = isSuperAdmin ? "/super-admin" : isAdmin ? "/admin" : "/";

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <header className="app-shell-header">
        <div className="app-shell-header-inner app-shell-header-inner--layout">
          <Link to={homeTo} className="app-shell-brand">
            AdapTest
          </Link>
          <nav className="app-shell-nav" aria-label="Main">
            {!isStaff ? (
              <>
                <NavLink to="/" end style={linkStyle}>
                  Home
                </NavLink>
                <NavLink to="/take-test" style={linkStyle}>
                  Take test
                </NavLink>
                <NavLink to="/history" style={linkStyle}>
                  My results
                </NavLink>
                <NavLink to="/performance" style={linkStyle}>
                  Performance
                </NavLink>
                <NavLink to="/review" style={linkStyle}>
                  Analytics
                </NavLink>
                <NavLink to="/papers" style={linkStyle}>
                  Papers
                </NavLink>
                {isStudent ? (
                  <NavLink to="/profile" style={linkStyle}>
                    Profile
                  </NavLink>
                ) : null}
              </>
            ) : isSuperAdmin ? (
              <NavLink to="/super-admin" style={linkStyle}>
                Super admin
              </NavLink>
            ) : (
              <NavLink to="/admin" style={linkStyle}>
                Admin
              </NavLink>
            )}
            {role ? (
              <button type="button" className="btn btn-ghost" onClick={logout} style={{ padding: "0.35rem 0.65rem", flexShrink: 0 }}>
                Logout
              </button>
            ) : (
              <NavLink to="/auth" style={linkStyle}>
                Login
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className={`app-shell-main${isAdminSection ? " app-shell-main--admin" : ""}`}>
        <Outlet />
      </main>
      <footer className="app-shell-footer">
        <a href="https://github.com/lobrockyl" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
          AdapTest - Adaptive Testing for your Success
        </a>
      </footer>
    </div>
  );
}
