"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MinusIcon, PlusIcon } from "@/components/icons";

// How long the open stepper waits for another tap before it closes.
const CLOSE_AFTER_MS = 3500;

type Step = {
  label: string;
  onClick: () => void;
  /** In place of the −, e.g. a bin when one fewer means deleting. */
  icon?: ReactNode;
  disabled?: boolean;
  /** The step closes the stepper, e.g. a delete that takes the row away. */
  closes?: boolean;
};

/**
 * A number shown as a pill that opens into − n + where it sits. It closes
 * after a few idle seconds, on Escape, or on a tap anywhere else.
 */
export function Stepper({
  value,
  pill,
  pillLabel,
  decrease,
  increase,
}: {
  value: number;
  /** What the closed stepper shows. */
  pill: ReactNode;
  pillLabel: string;
  decrease: Step;
  increase: Step;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pillButton = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    if (!root.current?.contains(document.activeElement)) return setOpen(false);
    // Focus inside goes back to the pill, so a keyboard doesn't lose its place.
    flushSync(() => setOpen(false));
    pillButton.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(close, CLOSE_AFTER_MS);
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", outside);
    };
    // A change of value starts the wait again.
  }, [open, value, close]);

  const step = ({ onClick, closes }: Step) => {
    if (closes) setOpen(false);
    onClick();
  };

  return (
    <div
      ref={root}
      className="flex shrink-0 items-center"
      onKeyDown={(event) => {
        if (open && event.key === "Escape") close();
      }}
    >
      {open ? (
        <div className="flex items-center rounded-full bg-stone-100">
          <button
            type="button"
            disabled={decrease.disabled}
            onClick={() => step(decrease)}
            aria-label={decrease.label}
            className={`flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30 ${
              decrease.icon ? "text-red-600 dark:text-red-400" : "text-stone-600 dark:text-stone-300"
            }`}
          >
            {decrease.icon ?? <MinusIcon width={16} height={16} strokeWidth={2.5} />}
          </button>
          <span aria-live="polite" className="min-w-6 text-center font-display text-base tabular-nums">
            {value}
          </span>
          <button
            type="button"
            // Opened from the keyboard, the stepper takes the focus the pill had.
            autoFocus
            onClick={() => step(increase)}
            aria-label={increase.label}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground"
          >
            <PlusIcon width={16} height={16} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <button
          ref={pillButton}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={pillLabel}
          className="-mr-1 flex h-11 items-center px-1"
        >
          {pill}
        </button>
      )}
    </div>
  );
}
