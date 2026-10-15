// Class names shared across screens, so every card, field and main button looks the same.

/** A soft card on the birch background: no border, a faint shadow in light mode only. */
export const card =
  "rounded-2xl bg-surface shadow-[0_1px_2px_rgba(60,40,20,0.06),0_6px_20px_rgba(60,40,20,0.05)] dark:shadow-none";

/** A text, number, date or select field; callers add the padding. */
export const field =
  "min-h-11 rounded-xl border border-stone-300 bg-surface text-base placeholder:text-stone-400 dark:border-stone-700";

/** The one main action on a screen, in lake blue. */
export const primaryButton = "rounded-xl bg-accent font-semibold text-accent-foreground disabled:opacity-40";

/** Lake-blue text links such as Back. */
export const textLink = "font-semibold text-accent";

/** Any other button that stands on its own, such as Share or Log out. */
export const secondaryButton = "rounded-xl border border-stone-300 bg-surface font-semibold dark:border-stone-700";

/** A list drawn as one card with soft dividers between its rows. */
export const cardList = `${card} divide-y divide-stone-200/70 dark:divide-stone-700/60`;
