// What Komero keeps in each browser history entry, next to Next's own fields:
// whether an earlier entry belongs to the app (so Back can go back to it), and
// the scroll position the Member left the screen at (so returning restores it).

type EntryState = { inApp?: boolean; scrollY?: number };

const read = (state: unknown): EntryState => (typeof state === "object" && state !== null ? state : {});

/** The state of the entry being left, with its scroll position remembered. */
export function leave(current: unknown, scrollY: number): EntryState {
  return { ...read(current), scrollY };
}

/**
 * The state for the entry a move within the app creates: pushed on top of an
 * entry of the app, or replacing `current`.
 */
export function arrive(current: unknown, { replace }: { replace: boolean }): EntryState {
  return { inApp: replace ? (read(current).inApp ?? false) : true };
}

/** Back goes back in history to the app's previous screen, or to Koti (or the screen's own home) when there is none. */
export function backFrom(state: unknown): "history" | "koti" {
  return read(state).inApp ? "history" : "koti";
}

/** Where a screen scrolls to when the Member comes back to its entry. */
export function scrollFor(state: unknown): number {
  return read(state).scrollY ?? 0;
}
