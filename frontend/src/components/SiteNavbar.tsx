import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";
import "../styles/landing.css";

function BoltIcon() {
  return (
    <svg className="landing-brand-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `landing-nav-link${isActive ? " landing-nav-link--active" : ""}`;
}

function ExamsNavLink() {
  const [showMockTests, setShowMockTests] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => {
      setShowMockTests((prev) => !prev);
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <NavLink
      to="/challenges"
      className={({ isActive }) =>
        [
          "landing-nav-link",
          showMockTests ? "landing-nav-link--exams-pulse-active" : "",
          isActive ? "landing-nav-link--active" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
    >
      {showMockTests ? "Mock Tests" : "Exams"}
    </NavLink>
  );
}

export function SiteNavbar() {
  const { pathname } = useLocation();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const isStudent = role === "student";
  const isAdmin = role === "admin";
  const isSuperAdmin = role === "super_admin";
  const isStaff = isAdmin || isSuperAdmin;

  const homeTo = isSuperAdmin ? "/super-admin" : isAdmin ? "/admin" : "/";
  const onLanding = pathname === "/";
  const mentorshipHref = onLanding ? "#mentorship" : "/#mentorship";
  const examCategoriesHref = onLanding ? "#exam-categories" : "/#exam-categories";

  const startHref = isStudent ? "/challenges" : "/auth";
  const startLabel = isStudent ? "Go to Challenges" : "Start Free Test";

  return (
    <header className="landing-header site-navbar">
      <div className="landing-header-inner">
        <Link to={homeTo} className="landing-brand">
          AdapTest
          <BoltIcon />
        </Link>

        <nav className="landing-nav site-navbar__links" aria-label="Main">
          {!isStaff ? (
            <>
              <NavLink to="/" end className={navLinkClass}>
                Home
              </NavLink>
              <ExamsNavLink />
              {isStudent ? (
                <>
                  <NavLink to="/take-test" className={navLinkClass}>
                    Take test
                  </NavLink>
                  <NavLink to="/history" className={navLinkClass}>
                    My results
                  </NavLink>
                  <NavLink to="/performance" className={navLinkClass}>
                    Performance
                  </NavLink>
                  <NavLink to="/review" className={navLinkClass}>
                    Analytics
                  </NavLink>
                  <NavLink to="/papers" className={navLinkClass}>
                    Papers
                  </NavLink>
                  <NavLink to="/profile" className={navLinkClass}>
                    Profile
                  </NavLink>
                </>
              ) : (
                <>
                  <a href={mentorshipHref} className="landing-nav-link">
                    Mentorship
                  </a>
                  <a href={examCategoriesHref} className="landing-nav-link">
                    Browse Exams
                  </a>
                  <NavLink to="/auth" className={navLinkClass}>
                    Sign In
                  </NavLink>
                </>
              )}
            </>
          ) : isSuperAdmin ? (
            <NavLink to="/super-admin" className={navLinkClass}>
              Super admin
            </NavLink>
          ) : (
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          )}
        </nav>

        <div className="landing-header-actions">
          {!isStaff ? (
            <Link to="/challenges" className="landing-live-badge">
              <span className="landing-live-dot" aria-hidden="true" />
              Live Tests
            </Link>
          ) : null}
          {!isStaff ? (
            <Link to={startHref} className="landing-btn-primary landing-btn-nav">
              {startLabel}
            </Link>
          ) : null}
          {role ? (
            <button type="button" className="landing-btn-secondary site-navbar__logout" onClick={logout}>
              Logout
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
