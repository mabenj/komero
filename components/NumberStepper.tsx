"use client";

import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { useEnterExit } from "@/components/motion";
import { useT } from "@/lib/i18n";

export const stepButton =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 disabled:opacity-30 dark:bg-stone-800 dark:text-stone-200";

/**
 * A row's number (Koti's Stock, Lista's quantity) as a pill; tapping it opens
 * – and + (and `extra`, such as delete) for this row only. It stays open while
 * the Member keeps counting, and closes on OK, Escape, or a tap anywhere
 * outside it, which includes another row's number, so one row is open at a time.
 * The pill is small, but its tap area is the full 44px, reaching into the row's padding.
 */
export function NumberStepper({
  text,
  label,
  dimmed = false,
  runningLow = false,
  onDecrease,
  decreaseLabel,
  decreaseDisabled = false,
  onIncrease,
  increaseLabel,
  extra,
}: {
  /** The number as shown, e.g. "2" or "×2". */
  text: string;
  /** What the pill opens, e.g. "Change Stock: Milk, 2 at home". */
  label: string;
  /** Out of Stock: an outlined, dimmed pill. */
  dimmed?: boolean;
  /** Running Low: the number in amber. */
  runningLow?: boolean;
  onDecrease: () => void;
  decreaseLabel: string;
  decreaseDisabled?: boolean;
  onIncrease: () => void;
  increaseLabel: string;
  extra?: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const stepper = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  // The pill and the stepper swap in place; the motion is on wrappers, so the buttons keep their press feedback.
  const swap = useEnterExit({ opacity: 0, scale: 0.9 });

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      if (!stepper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, [open]);

  const close = () => {
    flushSync(() => setOpen(false));
    pill.current?.focus();
  };

  const tone = dimmed ? "text-stone-400" : runningLow ? "text-amber-700 dark:text-amber-400" : "";
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {open ? (
        <motion.div
          key="stepper"
          {...swap}
          ref={stepper}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          className="flex shrink-0 items-center gap-1 rounded-full bg-accent/10 p-1"
        >
          <button
            type="button"
            className={stepButton}
            disabled={decreaseDisabled}
            aria-label={decreaseLabel}
            onClick={onDecrease}
          >
            <MinusIcon width={18} height={18} />
          </button>
          <span className={`min-w-7 text-center font-display text-base tabular-nums ${tone}`}>{text}</span>
          {/* Opening moves focus here, since the pill it replaced is gone. */}
          <button type="button" className={stepButton} aria-label={increaseLabel} onClick={onIncrease} autoFocus>
            <PlusIcon width={18} height={18} />
          </button>
          {extra}
          <button
            type="button"
            onClick={close}
            className="h-10 shrink-0 rounded-full px-3 text-sm font-semibold text-accent"
          >
            {t("common.ok")}
          </button>
        </motion.div>
      ) : (
        <motion.span key="pill" {...swap} className="flex shrink-0">
          <button
            ref={pill}
            type="button"
            aria-label={label}
            onClick={() => setOpen(true)}
            className="-my-1 flex min-h-11 min-w-11 items-center justify-center"
          >
            <span
              className={`min-w-9 rounded-full px-2 py-0.5 text-center font-display text-base tabular-nums ${tone} ${
                dimmed ? "ring-1 ring-stone-300 ring-inset dark:ring-stone-700" : "bg-stone-100 dark:bg-stone-800"
              }`}
            >
              {text}
            </span>
          </button>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
