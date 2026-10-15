// The Stock rules, in one place. Pure: mutations read a Product, apply a rule
// here and write the result back within the same transaction.

export type StockState = { stock: number };

/** Restock: n packages put away or scanned in. */
export function applyRestock(product: StockState, n: number): StockState {
  return { stock: product.stock + n };
}

/** Use: one package consumed or thrown away. Stock never goes below 0. */
export function applyUse(product: StockState): StockState {
  return { stock: Math.max(0, product.stock - 1) };
}

/** What the Needs Attention rules look at. */
export type AttentionState = StockState & { minimumStock?: number };

/** Running Low: Stock at or below the Minimum Stock, or at 0 without one. */
export function isRunningLow(product: AttentionState): boolean {
  return product.stock <= (product.minimumStock ?? 0);
}

/**
 * Whether a change made the Product Running Low when it wasn't before. The UI
 * shows the "running low" toast only then, not on every change while low.
 */
export function crossedIntoRunningLow(before: AttentionState, after: AttentionState): boolean {
  return !isRunningLow(before) && isRunningLow(after);
}

/**
 * Needs Attention statuses, most urgent first. Expiry statuses go before
 * `runningLow` as they are added.
 */
export const attentionStatuses = ["runningLow"] as const;
export type AttentionStatus = (typeof attentionStatuses)[number];

/** A Product's most urgent Needs Attention status, or null when it needs none. */
export function attentionStatus(product: AttentionState): AttentionStatus | null {
  if (isRunningLow(product)) return "runningLow";
  return null;
}

/** Sorts Needs Attention: the most urgent status first. */
export function byUrgency(a: AttentionStatus, b: AttentionStatus): number {
  return attentionStatuses.indexOf(a) - attentionStatuses.indexOf(b);
}
