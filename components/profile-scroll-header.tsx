"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const HEADER_HEIGHT = 80;
const FADE_DISTANCE = 72;

export function ProfileScrollHeader({
  name,
  description,
  surfaces,
}: {
  name: string;
  description: string;
  surfaces: string;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const hero = document.getElementById("project-hero");
    if (!hero) return;
    let frame = 0;
    const update = () => {
      const rect = hero.getBoundingClientRect();
      if (rect.height === 0) return;
      const remaining = rect.bottom - HEADER_HEIGHT;
      setProgress(1 - Math.min(1, Math.max(0, remaining / FADE_DISTANCE)));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const showProject = progress > 0.55;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="relative h-20 max-w-7xl mx-auto px-margin-mobile lg:px-margin-desktop">
        <div
          aria-hidden={showProject}
          className="absolute inset-0 flex items-center justify-between"
          style={{
            opacity: 1 - progress,
            transform: `translateY(${-8 * progress}px)`,
            pointerEvents: showProject ? "none" : "auto",
          }}
        >
          <Link
            className="font-headline-md text-headline-md tracking-tight text-on-surface hover:text-primary transition-colors duration-200"
            href="/"
          >
            Voice
          </Link>
          <nav className="flex items-center gap-space-lg">
            <Link
              className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors duration-150"
              href="/"
            >
              Projects
            </Link>
          </nav>
        </div>
        <div
          aria-hidden={!showProject}
          className="absolute inset-0 flex items-center justify-between gap-space-lg"
          style={{
            opacity: progress,
            transform: `translateY(${8 * (1 - progress)}px)`,
            pointerEvents: showProject ? "auto" : "none",
          }}
        >
          <div className="min-w-0">
            <p className="font-headline-md text-headline-md tracking-tight text-on-surface truncate">{name}</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant italic truncate">{description}</p>
          </div>
          <div className="px-space-md py-space-xs rounded-lg bg-surface-container-low shrink-0 text-on-surface font-code-md text-code-md">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="material-symbols-outlined text-[15px] text-tertiary">layers</span>
              Surfaces: {surfaces}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
