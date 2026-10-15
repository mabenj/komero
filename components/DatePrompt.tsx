"use client";

import { useState } from "react";
import { isDate } from "@/convex/stock";
import { useT } from "@/lib/i18n";

/**
 * Asks for the date printed on a Product's package when it is put away or
 * scanned in. Dates are always optional, so Skip is the big button.
 */
export function DatePrompt({
  name,
  step,
  answerLabel,
  onAnswer,
  onCancel,
}: {
  name: string;
  /** Where "Put away all" is, when it asks about several Products in a row. */
  step?: { index: number; count: number };
  /** The button that gives the date; "Put away" when not given. */
  answerLabel?: string;
  onAnswer: (date: string | undefined) => void;
  /** Without it there is no Cancel, only Skip (a scan has already Restocked). */
  onCancel?: () => void;
}) {
  const t = useT();
  const [date, setDate] = useState("");

  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-zinc-300 p-3 dark:border-zinc-700"
      onSubmit={(event) => {
        event.preventDefault();
        if (isDate(date)) onAnswer(date);
      }}
    >
      <p className="flex items-baseline justify-between gap-2 font-medium">
        <span>{t("lista.datePrompt", { name })}</span>
        {step && (
          <span className="shrink-0 text-sm text-zinc-500 tabular-nums">
            {t("lista.datePromptStep", { step: step.index + 1, count: step.count })}
          </span>
        )}
      </p>
      <input
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        aria-label={t("product.expiryDate")}
        className="min-h-11 w-full rounded-xl border border-zinc-300 bg-background px-4 py-2 text-base dark:border-zinc-700"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onAnswer(undefined)}
          className="min-h-14 flex-1 rounded-xl bg-foreground text-lg font-semibold text-background"
        >
          {t("lista.dateSkip")}
        </button>
        <button
          type="submit"
          disabled={!isDate(date)}
          className="min-h-14 flex-1 rounded-xl border border-zinc-300 text-lg font-semibold disabled:opacity-30 dark:border-zinc-700"
        >
          {answerLabel ?? t("lista.putAway")}
        </button>
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="min-h-11 text-zinc-500">
          {t("common.cancel")}
        </button>
      )}
    </form>
  );
}
