import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AdminCodeModal } from "./AdminCodeModal";
import { useAuthStore } from "../store/authStore";

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  fontWeight: isActive ? 600 : 500,
  color: isActive ? "#0f172a" : "#64748b",
  textDecoration: "none",
  padding: "0.35rem 0.65rem",
  borderRadius: 8,
  background: isActive ? "rgba(14,165,233,0.12)" : "transparent",
});

export function AppShell() {
  const { pathname } = useLocation();
  const role = useAuthStore((s) => s.role);
  const needsAdminCode = useAuthStore((s) => s.needsAdminCode);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = role === "admin";
  const isSuperAdmin = role === "super_admin";
  const isStaff = isAdmin || isSuperAdmin;
  const isAdminSection = pathname.startsWith("/admin") || pathname.startsWith("/super-admin");
  const homeTo = isSuperAdmin ? "/super-admin" : isAdmin ? "/admin" : "/";

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          flexShrink: 0,
          borderBottom: "1px solid var(--border)",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          className="app-shell-header-inner"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            paddingTop: "0.85rem",
            paddingBottom: "0.85rem",
          }}
        >
          <Link
            to={homeTo}
            style={{
              fontWeight: 700,
              fontSize: "1.05rem",
              color: "#0f172a",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <img
              src="/catking-logo.png"
              alt="CATKing"
              style={{ height: 32, maxWidth: 220, width: "auto", objectFit: "contain" }}
            />
            <span
              aria-hidden="true"
              style={{
                width: 1,
                height: 22,
                background: "#e2e8f0",
                flexShrink: 0,
                borderRadius: 1,
              }}
            />
            <span>AdapTest</span>
          </Link>
          <nav style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
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
                <NavLink to="/review" style={linkStyle}>
                  Analytics
                </NavLink>
                <NavLink to="/papers" style={linkStyle}>
                  Papers
                </NavLink>
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
              <button type="button" className="btn btn-ghost" onClick={logout} style={{ padding: "0.35rem 0.65rem" }}>
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
      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          margin: 0,
          padding: 0,
          background: isAdminSection ? "var(--bg-card)" : undefined,
        }}
      >
        <Outlet />
      </main>
      {role === "student" && needsAdminCode ? <AdminCodeModal /> : null}
      <footer style={{ padding: "1.5rem", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
        <a
          href="https://github.com/lobrockyl"
          target="_blank"
          rel="noreferrer"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          AdapTest - Adaptive Testing for your Success
        </a>
      </footer>
    </div>
  );
}
