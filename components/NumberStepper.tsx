"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { useT } from "@/lib/i18n";

export const stepButton =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 disabled:opacity-30 dark:bg-stone-800 dark:text-stone-200";

/**
 * A row's number (Koti's Stock, Lista's quantity) as a pill; tapping it opens
 * – and + (and `extra`, such as delete) for this row only. It stays open while
 * the Member keeps counting, and closes on OK, Escape, or a tap anywhere
 * outside it, which includes another row's number, so one row is open at a time.
 */
export function NumberStepper({
  value,
  label,
  dimmed = false,
  onDecrease,
  decreaseLabel,
  decreaseDisabled = false,
  onIncrease,
  increaseLabel,
  extra,
}: {
  value: ReactNode;
  /** What the pill opens, e.g. "Change Stock: Milk, 2 at home". */
  label: string;
  /** Out of Stock: an outlined, dimmed pill. */
  dimmed?: boolean;
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

  if (!open) {
    return (
      <button
        ref={pill}
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className={`min-h-11 min-w-12 shrink-0 rounded-full px-3 font-display text-xl tabular-nums ${
          dimmed ? "text-stone-400 ring-1 ring-stone-300 ring-inset dark:ring-stone-700" : "bg-stone-100 dark:bg-stone-800"
        }`}
      >
        {value}
      </button>
    );
  }

  return (
    <div
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
      <span className={`min-w-7 text-center font-display text-lg tabular-nums ${dimmed ? "text-stone-400" : ""}`}>
        {value}
      </span>
      {/* Opening moves focus here, since the pill it replaced is gone. */}
      <button type="button" className={stepButton} aria-label={increaseLabel} onClick={onIncrease} autoFocus>
        <PlusIcon width={18} height={18} />
      </button>
      {extra}
      <button type="button" onClick={close} className="h-10 shrink-0 rounded-full px-3 text-sm font-semibold text-accent">
        {t("common.ok")}
      </button>
    </div>
  );
}
