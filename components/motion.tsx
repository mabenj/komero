"use client";

import { MotionConfig, type Transition, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// Motion for the whole app (spec #19 "Motion"): springs start from wherever a
// thing is on screen, so every animation can be interrupted, and they move only
// transform and opacity. With reduced motion, they become short cross-fades.

/** The default spring: critically damped, so nothing overshoots. */
export const settle: Transition = { type: "spring", bounce: 0, visualDuration: 0.35 };

/** The one spring with a little bounce, for an Entry landing in the Bag. */
export const landInBag: Transition = { type: "spring", bounce: 0.25, visualDuration: 0.45 };

const crossFade: Transition = { duration: 0.15, ease: "easeOut" };

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
