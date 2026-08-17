import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/history", label: "My results", end: true },
  { to: "/performance", label: "Performance", end: true },
  { to: "/review", label: "Analytics", end: false },
  { to: "/papers", label: "Papers", end: true },
  { to: "/profile", label: "Profile", end: true },
] as const;

export function StudentSubNav() {
  return (
    <nav className="student-sub-nav" aria-label="Student area">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `student-sub-nav__link${isActive ? " student-sub-nav__link--active" : ""}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
