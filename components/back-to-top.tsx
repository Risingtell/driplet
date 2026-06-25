"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/** Floating "back to top" button that appears once you scroll down a long page. */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className="fixed bottom-5 right-5 z-50 grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg drip-glow transition-transform hover:-translate-y-0.5"
    >
      <ArrowUp className="size-5" />
    </button>
  );
}
