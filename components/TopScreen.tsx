"use client";

import { motion, useIsPresent } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { crossFade } from "@/components/motion";

/**
 * A screen (a Product page) that opens over a `CoveredScreen`: it fades in
 * rising a little, quickly, and fades back out in place. Render it inside
 * `AnimatePresence`. While it leaves, it is pinned where it was on screen, so
 * the screen returned to can take its place, and its scroll position,
 * underneath it.
 */
export function TopScreen({ children }: { children: ReactNode }) {
  const screen = useRef<HTMLDivElement>(null);
  const isPresent = useIsPresent();
  const top = useRef(0);

  useLayoutEffect(() => {
    if (!isPresent) return;
    const measure = () => {
      if (screen.current) top.current = screen.current.getBoundingClientRect().top;
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    return () => window.removeEventListener("scroll", measure);
  }, [isPresent]);

  useLayoutEffect(() => {
    const element = screen.current;
    if (isPresent || !element) return;
    // Layout values, not the on-screen box, which includes the rise.
    const pinned = {
      position: "fixed",
      top: `${top.current}px`,
      bottom: "0",
      left: `${element.offsetLeft}px`,
      width: `${element.offsetWidth}px`,
      overflow: "hidden",
      zIndex: "5",
    } as const;
    Object.assign(element.style, pinned);
    // Coming back while leaving puts it back in place.
    return () => {
      Object.assign(element.style, Object.fromEntries(Object.keys(pinned).map((property) => [property, ""])));
    };
  }, [isPresent]);

  return (
    // Positioned, so it stays over the `CoveredScreen` once the rise's transform is gone.
    <motion.div
      ref={screen}
      // Under reduced motion `MotionProvider` drops the rise, leaving the fade.
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={crossFade}
      className="relative -mx-4 -mt-2 bg-background px-4 pt-8"
    >
      {children}
    </motion.div>
  );
}

/**
 * The screen a `TopScreen` opened from, rendered before it. It stays mounted
 * while `covered`, so it keeps its state (such as Koti's search) and the
 * TopScreen fades in and back out over it. While covered, it is fixed where
 * it was on screen, so the TopScreen has the page's scroll to itself, inert,
 * and hidden once the TopScreen has faded in. Uncovered, it returns to the
 * page at once, for the screen's scroll position to be restored.
 */
export function CoveredScreen({ covered, children }: { covered: boolean; children: ReactNode }) {
  const screen = useRef<HTMLDivElement>(null);

  // Before the page scrolls for the TopScreen (see `useScrollRestore`), which runs after this.
  useLayoutEffect(() => {
    const element = screen.current;
    if (!covered || !element) return;
    const { top, left, width } = element.getBoundingClientRect();
    const fixed = { position: "fixed", top: `${top}px`, left: `${left}px`, width: `${width}px` } as const;
    Object.assign(element.style, fixed);
    return () => {
      Object.assign(element.style, Object.fromEntries(Object.keys(fixed).map((property) => [property, ""])));
    };
  }, [covered]);

  return (
    <div
      ref={screen}
      inert={covered}
      // Hidden just after the TopScreen's `crossFade` (0.15s) has finished.
      className={covered ? "invisible transition-[visibility] delay-300 duration-0" : undefined}
    >
      {children}
    </div>
  );
}
