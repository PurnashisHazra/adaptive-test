import { Link } from "react-router-dom";
import { SITE_NAME } from "../seo/site";

const EXAM_LINKS = [
  { to: "/cat-mock-test", label: "CAT mock test" },
  { to: "/ssc-mock-test", label: "SSC mock test" },
  { to: "/bank-exam-mock-test", label: "Bank exam mock test" },
  { to: "/mock-tests", label: "All mock tests" },
] as const;

export function SeoFooter() {
  return (
    <footer className="seo-footer">
      <div className="content-inner seo-footer__inner">
        <div className="seo-footer__brand">
          <Link to="/" className="seo-footer__logo">
            <img src="/emgc-logo.png" alt="EMGC" className="seo-footer__logo-img" />
            <span className="seo-footer__logo-divider" aria-hidden>
              |
            </span>
            <span>Testhub</span>
          </Link>
          <p className="seo-footer__tagline">
            Adaptive CAT mocks, SSC mock tests, and banking practice—questions that match your level after every answer.
          </p>
        </div>
        <nav className="seo-footer__nav" aria-label="Mock tests">
          <p className="seo-footer__nav-title">Mock tests</p>
          <ul>
            {EXAM_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="seo-footer__nav" aria-label="Account">
          <p className="seo-footer__nav-title">Get started</p>
          <ul>
            <li>
              <Link to="/auth">Sign in / Register</Link>
            </li>
            <li>
              <Link to="/">Live challenges</Link>
            </li>
          </ul>
        </nav>
      </div>
      <p className="seo-footer__copy content-inner">
        © {new Date().getFullYear()} {SITE_NAME}. Competitive exam practice platform for Indian aspirants.
      </p>
    </footer>
  );
}
