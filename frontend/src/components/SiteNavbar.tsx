import { Link, NavLink, useLocation } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
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

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="site-navbar__menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {open ? (
        <>
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function ExamsNavLink({ onNavigate }: { onNavigate?: () => void }) {
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
      onClick={onNavigate}
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
      {showMockTests ? "Mock Tests" : "Mock Tests"}
    </NavLink>
  );
}

function NavLinks({
  isStaff,
  isStudent,
  isSuperAdmin,
  mentorshipHref,
  examCategoriesHref,
  onNavigate,
  mobile,
}: {
  isStaff: boolean;
  isStudent: boolean;
  isSuperAdmin: boolean;
  mentorshipHref: string;
  examCategoriesHref: string;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const linkProps = onNavigate ? { onClick: onNavigate } : {};

  if (isStaff) {
    return isSuperAdmin ? (
      <NavLink to="/super-admin" className={navLinkClass} {...linkProps}>
        Super admin
      </NavLink>
    ) : (
      <NavLink to="/admin" className={navLinkClass} {...linkProps}>
        Admin
      </NavLink>
    );
  }

  return (
    <>
      <NavLink to="/" end className={navLinkClass} {...linkProps}>
        Home
      </NavLink>
      <ExamsNavLink onNavigate={onNavigate} />
      {isStudent ? (
        <>
          <NavLink to="/take-test" className={navLinkClass} {...linkProps}>
            Take test
          </NavLink>
          <NavLink to="/history" className={navLinkClass} {...linkProps}>
            My results
          </NavLink>
          <NavLink to="/performance" className={navLinkClass} {...linkProps}>
            Performance
          </NavLink>
          <NavLink to="/review" className={navLinkClass} {...linkProps}>
            Analytics
          </NavLink>
          <NavLink to="/papers" className={navLinkClass} {...linkProps}>
            Papers
          </NavLink>
          <NavLink to="/profile" className={navLinkClass} {...linkProps}>
            Profile
          </NavLink>
        </>
      ) : (
        <>
          <a href={mentorshipHref} className="landing-nav-link" onClick={onNavigate}>
            Mentorship
          </a>
          <a href={examCategoriesHref} className="landing-nav-link" onClick={onNavigate}>
            Browse Exams
          </a>
          <NavLink to="/auth" className={navLinkClass} {...linkProps}>
            Sign In
          </NavLink>
        </>
      )}
      {mobile && !isStaff ? (
        <Link to="/challenges" className="landing-nav-link landing-nav-link--mobile-live" onClick={onNavigate}>
          <span className="landing-live-dot" aria-hidden="true" />
          Live Tests
        </Link>
      ) : null}
    </>
  );
}

function HeaderActions({
  isStaff,
  startHref,
  startLabel,
  role,
  logout,
  onNavigate,
}: {
  isStaff: boolean;
  startHref: string;
  startLabel: string;
  role: string | null;
  logout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      {!isStaff ? (
        <Link to="/challenges" className="landing-live-badge" onClick={onNavigate}>
          <span className="landing-live-dot" aria-hidden="true" />
          Live Tests
        </Link>
      ) : null}
      {!isStaff ? (
        <Link to={startHref} className="landing-btn-primary landing-btn-nav" onClick={onNavigate}>
          {startLabel}
        </Link>
      ) : null}
      {role ? (
        <button type="button" className="landing-btn-secondary site-navbar__logout" onClick={() => { logout(); onNavigate?.(); }}>
          Logout
        </button>
      ) : null}
    </>
  );
}

export function SiteNavbar() {
  const { pathname } = useLocation();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);

  const navProps = {
    isStaff,
    isStudent,
    isSuperAdmin,
    mentorshipHref,
    examCategoriesHref,
  };

  const actionProps = {
    isStaff,
    startHref,
    startLabel,
    role,
    logout,
  };

  return (
    <header className={`landing-header site-navbar${menuOpen ? " site-navbar--menu-open" : ""}`}>
      <div className="landing-header-inner">
        <Link to={homeTo} className="landing-brand" onClick={closeMenu}>
          AdapTest
          <BoltIcon />
        </Link>

        <nav className="landing-nav site-navbar__links site-navbar__links--desktop" aria-label="Main">
          <NavLinks {...navProps} />
        </nav>

        <div className="landing-header-actions site-navbar__actions--desktop">
          <HeaderActions {...actionProps} />
        </div>

        <div className="site-navbar__mobile-bar">
          <button
            type="button"
            className="site-navbar__menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="site-navbar-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>

      <button
        type="button"
        className="site-navbar__backdrop"
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={closeMenu}
      />

      <nav
        id="site-navbar-mobile-menu"
        className="site-navbar__mobile-menu"
        aria-label="Mobile navigation"
        aria-hidden={!menuOpen}
      >
        {!isStaff ? (
          <Link
            to={startHref}
            className="landing-btn-primary landing-btn-nav site-navbar__mobile-menu-cta"
            onClick={closeMenu}
          >
            {startLabel}
          </Link>
        ) : null}
        <div className="site-navbar__mobile-links">
          <NavLinks {...navProps} onNavigate={closeMenu} mobile />
        </div>
        {role ? (
          <div className="site-navbar__mobile-actions">
            <button
              type="button"
              className="landing-btn-secondary site-navbar__logout"
              onClick={() => {
                logout();
                closeMenu();
              }}
            >
              Logout
            </button>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
