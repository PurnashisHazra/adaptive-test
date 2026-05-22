import { Link } from "react-router-dom";

export function AdaptiveTestPitch({
  showCta = true,
  signedIn = false,
}: {
  showCta?: boolean;
  signedIn?: boolean;
}) {
  return (
    <section className="adaptive-pitch" aria-labelledby="adaptive-pitch-heading">
      <div className="adaptive-pitch__header">
        <span className="adaptive-pitch__eyebrow">AdapTest AI</span>
        <h2 id="adaptive-pitch-heading" className="adaptive-pitch__title">
          Every next question fits <em>you</em>
        </h2>
        <p className="adaptive-pitch__lead">
          After each answer, AdapTest AI looks at your <strong>accuracy</strong>, <strong>speed</strong>, and whether you
          showed <strong>knowledge</strong> on that question to choose what comes next. The test reshapes as you go.
        </p>
      </div>

      <details className="adaptive-pitch__more">
        <summary className="adaptive-pitch__more-toggle">Learn more</summary>
        <div className="adaptive-pitch__more-body">
          <div className="adaptive-pitch__flow" aria-hidden>
            <span className="adaptive-pitch__flow-step">Your answer</span>
            <span className="adaptive-pitch__flow-arrow">→</span>
            <span className="adaptive-pitch__flow-core">AdapTest AI</span>
            <span className="adaptive-pitch__flow-arrow">→</span>
            <span className="adaptive-pitch__flow-step">Next question</span>
          </div>

          <ul className="adaptive-pitch__signals">
            <li>Accuracy</li>
            <li>Speed</li>
            <li>Knowledge</li>
          </ul>

          <div className="adaptive-pitch__paths">
            <article className="adaptive-pitch__path adaptive-pitch__path--build">
              <h3 className="adaptive-pitch__path-title">Still building basics</h3>
              <p className="adaptive-pitch__path-desc">
                You&apos;ll see foundational questions first. As you improve, difficulty steps up gradually—training you
                toward tougher problems instead of jumping ahead too soon.
              </p>
              <div className="adaptive-pitch__ladder" aria-hidden>
                <span>Easy</span>
                <span>Medium</span>
                <span>Hard</span>
              </div>
            </article>
            <article className="adaptive-pitch__path adaptive-pitch__path--climb">
              <h3 className="adaptive-pitch__path-title">Already strong</h3>
              <p className="adaptive-pitch__path-desc">
                When you&apos;re accurate and quick, the engine pushes harder items right away—keeping you stretched with
                increasingly difficult questions.
              </p>
              <div className="adaptive-pitch__ladder adaptive-pitch__ladder--steep" aria-hidden>
                <span>Hard</span>
                <span>Harder</span>
                <span>Expert</span>
              </div>
            </article>
          </div>

          {showCta ? (
            <div className="adaptive-pitch__cta">
              {signedIn ? (
                <Link to="/take-test" className="btn btn-primary">
                  Start adaptive practice test
                </Link>
              ) : (
                <Link to="/auth" className="btn btn-primary">
                  Sign in to practice
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
