// Class names shared across screens, so every card, list, field and main button looks the same.
import type { AttentionStatus } from "@/convex/stock";

/** A white block on the grey page: no border, no shadow. */
export const card = "rounded-lg bg-surface";

/** A white card that stands out from the page: a faint shadow by day. */
export const raisedCard = "rounded-2xl bg-surface shadow-raised";

/**
 * A segmented control's options (filter tiles, Location tabs): the chosen one
 * is a raised card, the others lie flat on the grey.
 */
export const segment = (chosen: boolean) =>
  chosen
    ? "bg-surface text-foreground shadow-raised dark:bg-stone-200"
    : "bg-stone-200/60 text-stone-500 dark:bg-transparent dark:ring-1 dark:ring-stone-200 dark:ring-inset";

/** An inset grouped list (Komero's Locations, a Product's facts); its rows are `groupRow`. */
export const group = "overflow-hidden rounded-xl bg-surface shadow-raised";

/** The small uppercase heading over a `group`. */
export const groupHeader = "px-4 pb-1.5 text-[13px] text-secondary uppercase";

/** A row of a `group`: a hairline above it, inset from the left, except on the first. */
export const groupRow =
  "relative [&+li]:before:absolute [&+li]:before:top-0 [&+li]:before:right-0 [&+li]:before:left-4 [&+li]:before:h-px [&+li]:before:bg-hairline";

/** A text, number, date or select field, filled grey with a strong bottom edge; callers add the padding. */
export const field =
  "min-h-11 rounded-md border-b-2 border-stone-300 bg-stone-100 text-base placeholder:text-stone-400 focus:border-accent dark:border-stone-600";

/** The one main action on a screen, in carrot. */
export const primaryButton = "rounded-md bg-accent font-semibold text-accent-foreground disabled:opacity-40";

/** Carrot text links such as Back. */
export const textLink = "font-semibold text-accent";

/** Any other button that stands on its own, such as Share or Log out: a flat grey fill. */
export const secondaryButton = "rounded-md bg-stone-200 font-semibold dark:bg-stone-700";

/** A list drawn as one card with hairline dividers between its rows. */
export const cardList = `${card} divide-y divide-hairline`;

/** A round – or + (or other icon) button, such as for Stock on the Product page. */
export const stepButton =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 disabled:opacity-30 dark:bg-stone-800 dark:text-stone-200";

const dateTone = {
  text: "text-amber-700 dark:text-amber-400",
  pill: "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200",
};

/** What a Needs Attention status looks like: red for expired, amber for the dates, sky for Running Low. */
export const statusTone: Record<AttentionStatus, { text: string; pill: string }> = {
  expired: {
    text: "text-red-700 dark:text-red-400",
    pill: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
  },
  checkIt: dateTone,
  expiringSoon: dateTone,
  runningLow: {
    text: "text-sky-700 dark:text-sky-300",
    pill: "bg-sky-100 text-sky-800 dark:bg-sky-400/20 dark:text-sky-200",
  },
};
