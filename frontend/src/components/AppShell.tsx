import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
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
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = role === "admin";
  const isAdminSection = pathname.startsWith("/admin");

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
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0.85rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <Link to="/" style={{ fontWeight: 700, fontSize: "1.05rem", color: "#0f172a", textDecoration: "none" }}>
            AdaptTest
          </Link>
          <nav style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
            <NavLink to="/" end style={linkStyle}>
              Home
            </NavLink>
            <NavLink to="/start" style={linkStyle}>
              Take test
            </NavLink>
            <NavLink to="/history" style={linkStyle}>
              My results
            </NavLink>
            {!isAdmin ? (
              <>
                <NavLink to="/review" style={linkStyle}>
                  Analytics
                </NavLink>
                <NavLink to="/papers" style={linkStyle}>
                  Papers
                </NavLink>
              </>
            ) : null}
            {isAdmin && (
              <>
                <span style={{ color: "#cbd5e1", margin: "0 0.25rem" }}>|</span>
                <NavLink to="/admin" style={linkStyle}>
                  Admin
                </NavLink>
              </>
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
      <footer style={{ padding: "1.5rem", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
        Adaptive assessment · server-controlled difficulty
      </footer>
    </div>
  );
}
