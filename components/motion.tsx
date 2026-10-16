"use client";

import { MotionConfig, motion, type Transition, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// Motion for the whole app (spec #19 "Motion"): springs start from wherever a
// thing is on screen, so every animation can be interrupted, and they move only
// transform and opacity. With reduced motion, they become short cross-fades.
// Koti's table rows and everything on Kauppalista stay still (#31): rows appear,
// move and leave at once, like a table or a checklist.

/** The default spring: critically damped, so nothing overshoots. */
export const settle: Transition = { type: "spring", bounce: 0, visualDuration: 0.35 };

/** A swiped row springing back with a little bounce; give it the release `velocity`. */
export const swipeBack: Transition = { type: "spring", bounce: 0.25, visualDuration: 0.4 };

export const crossFade: Transition = { duration: 0.15, ease: "easeOut" };

/** The defaults for every animation in the signed-in app. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={settle}>
      {children}
    </MotionConfig>
  );
}

type Hidden = { x?: number | string; y?: number | string; opacity?: number; scale?: number };

/**
 * Props for something that comes in from `hidden` and leaves the same way,
 * e.g. `{ x: "100%" }` for a page sliding in from the right. Under reduced
 * motion it cross-fades instead.
 */
export function useEnterExit(hidden: Hidden) {
  const reduced = useReducedMotion();
  if (reduced) return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: crossFade };
  const shown = Object.fromEntries(Object.keys(hidden).map((key) => [key, key === "opacity" || key === "scale" ? 1 : 0]));
  return { initial: hidden, animate: shown, exit: hidden, transition: settle };
}

/**
 * The `layout` prop for rows and sections that slide to their new place when
 * something above them appears or leaves. Under reduced motion they just move.
 */
export function useLayoutMotion() {
  return useReducedMotion() ? undefined : ("position" as const);
}

/** Props for a section of a list that fades in and out, and slides to its new place. */
export function useSectionMotion() {
  return { layout: useLayoutMotion(), ...useEnterExit({ opacity: 0 }) };
}

/**
 * Something that opens under what was tapped, such as a date prompt, and
 * closes the same way. Render it inside `AnimatePresence`.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reveal = useEnterExit({ y: -8, opacity: 0 });
  return (
    <motion.div {...reveal} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * Something that folds open under its heading and shut again, growing from no
 * height so whatever is below moves along with it. It clips only while it moves,
 * so card shadows show once it's open. Render it inside `AnimatePresence`;
 * under reduced motion it cross-fades.
 */
export function Fold({ children, id }: { children: ReactNode; id?: string }) {
  const reduced = useReducedMotion();
  const shut = reduced ? { opacity: 0 } : { height: 0, opacity: 0, overflow: "hidden" };
  const open = reduced ? { opacity: 1 } : { height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } };
  return (
    <motion.div id={id} initial={shut} animate={open} exit={shut} transition={reduced ? crossFade : settle}>
      {children}
    </motion.div>
  );
}
