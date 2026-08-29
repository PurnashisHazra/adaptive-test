import { useEffect, useState } from "react";

const SLIDES = [
  {
    src: "/hero/emgc-gateway.png",
    alt: "Your gateway to top competitive exams — EMGC coaching in Mumbai",
  },
  {
    src: "/hero/emgc-hall-of-fame.png",
    alt: "EMGC hall of fame — toppers across CAT, SSC, banking, and law",
  },
];

function CarouselArrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      {dir === "prev" ? <path d="M15 6 9 12l6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}

export function HeroImageCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, []);

  const slide = SLIDES[index] ?? SLIDES[0];

  return (
    <div className="landing-hero-carousel" aria-roledescription="carousel" aria-label="EMGC highlights">
      <img src={slide.src} alt={slide.alt} />
      <button
        type="button"
        className="landing-hero-carousel-arrow landing-hero-carousel-arrow--prev"
        aria-label="Previous image"
        onClick={() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
      >
        <CarouselArrow dir="prev" />
      </button>
      <button
        type="button"
        className="landing-hero-carousel-arrow landing-hero-carousel-arrow--next"
        aria-label="Next image"
        onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
      >
        <CarouselArrow dir="next" />
      </button>
      <div className="landing-hero-carousel-dots" role="tablist" aria-label="Carousel slides">
        {SLIDES.map((item, i) => (
          <button
            key={item.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Show image ${i + 1}`}
            className={`landing-hero-carousel-dot${i === index ? " is-active" : ""}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
