import { useEffect, useState } from "react";
import type { ExamNewsItem } from "../api/types";

function NewsArrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      {dir === "prev" ? <path d="M15 6 9 12l6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}

export function ExamNewsCarousel({ items }: { items: ExamNewsItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [items]);

  useEffect(() => {
    if (items.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="landing-news">
        <p className="landing-topper-kicker">Exam news</p>
        <p className="landing-topper-empty">News will appear here shortly.</p>
      </div>
    );
  }

  const item = items[index] ?? items[0];

  return (
    <div className="landing-news" aria-roledescription="carousel" aria-label="Exam news">
      <div className="landing-news-head">
        <p className="landing-topper-kicker">Exam news</p>
        {items.length > 1 ? (
          <div className="landing-news-nav">
            <button
              type="button"
              className="landing-news-arrow"
              aria-label="Previous headline"
              onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
            >
              <NewsArrow dir="prev" />
            </button>
            <span className="landing-news-count">
              {index + 1}/{items.length}
            </span>
            <button
              type="button"
              className="landing-news-arrow"
              aria-label="Next headline"
              onClick={() => setIndex((i) => (i + 1) % items.length)}
            >
              <NewsArrow dir="next" />
            </button>
          </div>
        ) : null}
      </div>
      <div className="landing-news-item">
        {item.category ? <span className="landing-news-cat">{item.category}</span> : null}
        <span className="landing-news-title">{item.title}</span>
        {item.excerpt ? <span className="landing-news-excerpt">{item.excerpt}</span> : null}
      </div>
    </div>
  );
}
