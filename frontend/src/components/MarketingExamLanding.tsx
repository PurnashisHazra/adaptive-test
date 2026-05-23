import { Link } from "react-router-dom";
import { Seo } from "./Seo";
import { SeoFooter } from "./SeoFooter";
import { AdaptiveTestPitch } from "./AdaptiveTestPitch";
import type { PageSeo } from "../seo/types";
import { courseJsonLd, faqPageJsonLd } from "../seo/jsonLd";

export type ExamLandingSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export function MarketingExamLanding({
  seo,
  h1,
  intro,
  sections,
  faqs,
  relatedLinks,
  course,
}: {
  seo: PageSeo;
  h1: string;
  intro: string;
  sections: ExamLandingSection[];
  faqs: { question: string; answer: string }[];
  relatedLinks: { href: string; label: string }[];
  course: { name: string; description: string; keywords: string[] };
}) {
  const jsonLd = [courseJsonLd({ ...course, path: seo.path }), faqPageJsonLd(faqs)];

  return (
    <>
      <Seo seo={seo} jsonLd={jsonLd} />
      <article className="page seo-landing">
        <div className="content-inner seo-landing__inner">
          <nav className="seo-landing__breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden> / </span>
            <Link to="/mock-tests">Mock tests</Link>
            <span aria-hidden> / </span>
            <span>{h1}</span>
          </nav>

          <header className="seo-landing__hero">
            <p className="seo-landing__eyebrow">AdapTest — adaptive mock tests</p>
            <h1 className="seo-landing__h1">{h1}</h1>
            <p className="seo-landing__intro">{intro}</p>
            <div className="seo-landing__cta-row">
              <Link to="/auth" className="btn btn-primary">
                Start free mock test
              </Link>
              <Link to="/" className="btn btn-secondary">
                View live challenges
              </Link>
            </div>
          </header>

          {sections.map((sec) => (
            <section key={sec.heading} className="seo-landing__section">
              <h2 className="seo-landing__h2">{sec.heading}</h2>
              {sec.paragraphs.map((p, i) => (
                <p key={i} className="seo-landing__p">
                  {p}
                </p>
              ))}
              {sec.bullets?.length ? (
                <ul className="seo-landing__list">
                  {sec.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <section className="seo-landing__section" aria-labelledby="adaptive-pitch-heading">
            <h2 className="seo-landing__h2">How adaptive mocks work</h2>
            <AdaptiveTestPitch showCta signedIn={false} />
          </section>

          <section className="seo-landing__section seo-landing__faq" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="seo-landing__h2">
              Frequently asked questions
            </h2>
            <dl className="seo-landing__faq-list">
              {faqs.map((f) => (
                <div key={f.question} className="seo-landing__faq-item">
                  <dt>{f.question}</dt>
                  <dd>{f.answer}</dd>
                </div>
              ))}
            </dl>
          </section>

          {relatedLinks.length > 0 ? (
            <section className="seo-landing__section">
              <h2 className="seo-landing__h2">More mock tests on AdapTest</h2>
              <ul className="seo-landing__related">
                {relatedLinks.map((l) => (
                  <li key={l.href}>
                    <Link to={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <SeoFooter />
      </article>
    </>
  );
}
