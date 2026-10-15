"use client";

import { motion, useIsPresent } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { useEnterExit } from "@/components/motion";

/**
 * A screen (a Product page) that slides in from the right and back out to the
 * right. Render it inside `AnimatePresence`. While it leaves, it is pinned
 * where it was on screen, so the screen returned to can take its place, and
 * its scroll position, underneath it.
 */
export function SlideOver({ children }: { children: ReactNode }) {
  const screen = useRef<HTMLDivElement>(null);
  const isPresent = useIsPresent();
  const top = useRef(0);
  const slide = useEnterExit({ x: "100%" });

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
    // Layout values, not the on-screen box, which includes the slide.
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
    <motion.div ref={screen} {...slide} className="-mx-4 -mt-4 bg-background px-4 pt-4">
      {children}
    </motion.div>
  );
}
