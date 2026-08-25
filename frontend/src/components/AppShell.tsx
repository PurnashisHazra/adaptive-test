import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { SiteNavbar } from "./SiteNavbar";
import { useAuthStore } from "../store/authStore";

export function AppShell() {
  const { pathname } = useLocation();
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const isSuperAdmin = pathname.startsWith("/super-admin");
  const isAdminSection = pathname.startsWith("/admin");
  const isStudentHub = /^\/(history|performance|review|papers|profile)(\/|$)/.test(pathname);
  const isExamFullscreen = pathname === "/test" || pathname === "/instructions";

  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  if (isExamFullscreen) {
    return (
      <main style={{ flex: 1, width: "100%", minHeight: "100vh", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        <Outlet />
      </main>
    );
  }

  return (
    <div className="app-shell">
      <SiteNavbar />
      <main
        className={`app-shell-main${isSuperAdmin ? " app-shell-main--landing" : ""}${isAdminSection ? " app-shell-main--admin" : ""}${isStudentHub ? " app-shell-main--student" : ""}`}
      >
        <Outlet />
      </main>
    </div>
  );
}
