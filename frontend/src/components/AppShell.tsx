import { Outlet, useLocation } from "react-router-dom";
import { SiteNavbar } from "./SiteNavbar";

export function AppShell() {
  const { pathname } = useLocation();
  const isAdminSection = pathname.startsWith("/admin") || pathname.startsWith("/super-admin");
  const isExamFullscreen = pathname === "/test" || pathname === "/instructions";

  if (isExamFullscreen) {
    return (
      <main style={{ flex: 1, width: "100%", minHeight: "100vh", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        <Outlet />
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
      <SiteNavbar />
      <main className={`app-shell-main${isAdminSection ? " app-shell-main--admin" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}
