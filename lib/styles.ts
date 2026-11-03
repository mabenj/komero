// Class names shared across screens, so every card, field and main button looks the same.

/** A flat white block on the grey page: no border, no shadow. */
export const card = "rounded-lg bg-surface";

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
export const cardList = `${card} divide-y divide-stone-100 dark:divide-stone-200`;
