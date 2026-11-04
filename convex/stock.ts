// The Stock rules, in one place. Pure: mutations read a Product, apply a rule
// here and write the result back within the same transaction.
import { type Infer, v } from "convex/values";

/** A Product's Expiry Kind. Absent means none: the Product never asks for a date. */
export const expiryKind = v.union(v.literal("bestBefore"), v.literal("useBy"));
export type ExpiryKind = Infer<typeof expiryKind>;
export const EXPIRY_KINDS: ExpiryKind[] = expiryKind.members.map((member) => member.value);

/**
 * Stock and its Expiry Date ("YYYY-MM-DD"). The date only applies with an
 * Expiry Kind; `expiryDate: undefined` in a result means the date is cleared.
 */
export type StockState = { stock: number; expiryKind?: ExpiryKind; expiryDate?: string };

/**
 * Restock: n packages put away or scanned in, with the date printed on them if
 * one was given. From 0 the new date becomes the Expiry Date; otherwise the
 * earlier date is kept, and an undated Restock keeps the existing one.
 */
export function applyRestock(product: StockState, n: number, date?: string): StockState {
  const dated = product.expiryKind ? date : undefined;
  const expiryDate =
    product.stock === 0 ? dated : [product.expiryDate, dated].filter((d) => d !== undefined).sort()[0];
  return { stock: product.stock + n, expiryDate };
}

/**
 * Use: one package consumed or thrown away. Stock never goes below 0. The
 * Expiry Date stays while Stock remains and is cleared at 0.
 */
export function applyUse(product: StockState): StockState {
  const stock = Math.max(0, product.stock - 1);
  return { stock, expiryDate: stock === 0 ? undefined : product.expiryDate };
}

/** What undoing a Stock change needs: the Stock before and after, and the Expiry Date before. */
export const stockChange = v.object({ from: v.number(), to: v.number(), expiryDateBefore: v.optional(v.string()) });

/**
 * Undo of a Stock change from `from` to `to` (a + or –, a scan, a Put Away):
 * the change is reversed on top of the current Stock, so changes made on other
 * phones in between are kept, and the Expiry Date goes back to what it was
 * before the change (`expiryDateBefore`), cleared if Stock ends up at 0.
 */
export function applyUndo(
  product: StockState,
  { from, to, expiryDateBefore }: Infer<typeof stockChange>,
): StockState {
  const stock = Math.max(0, product.stock - (to - from));
  return { stock, expiryDate: stock > 0 && product.expiryKind ? expiryDateBefore : undefined };
}

/** Whether `text` is a real calendar day written "YYYY-MM-DD", the form Expiry Dates are kept in. */
export function isDate(text: string): boolean {
  const time = Date.parse(`${text}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(time) && new Date(time).toISOString().startsWith(text);
}

/** What the Needs Attention rules look at. */
export type AttentionState = StockState & { minimumStock?: number };

/** A Product as queries send it (null for what it doesn't have), as the Needs Attention rules look at it. */
export function toAttentionState(product: {
  stock: number;
  expiryKind: ExpiryKind | null;
  expiryDate: string | null;
  minimumStock: number | null;
}): AttentionState {
  return {
    stock: product.stock,
    expiryKind: product.expiryKind ?? undefined,
    expiryDate: product.expiryDate ?? undefined,
    minimumStock: product.minimumStock ?? undefined,
  };
}

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
 * Needs Attention statuses, most urgent first: past Use By, past Best Before,
 * expiring soon, Running Low.
 */
export const attentionStatuses = ["expired", "checkIt", "expiringSoon", "runningLow"] as const;
export type AttentionStatus = (typeof attentionStatuses)[number];

/** How many days ahead an Expiry Date counts as expiring soon. */
const EXPIRING_SOON_DAYS = 3;

/**
 * What a Product's Expiry Date means on `today` (the Member's "YYYY-MM-DD"),
 * or null when it means nothing yet. Koti's date badges use it too.
 */
export function expiryStatus(product: AttentionState, today: string): AttentionStatus | null {
  const { expiryKind, expiryDate } = product;
  if (!expiryKind || !expiryDate) return null;
  if (expiryDate < today) return expiryKind === "useBy" ? "expired" : "checkIt";
  if (expiryDate <= addDays(today, EXPIRING_SOON_DAYS)) return "expiringSoon";
  return null;
}

function addDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 24 * 60 * 60 * 1000;
  return new Date(time).toISOString().slice(0, 10);
}

/** A Product's most urgent Needs Attention status on `today`, or null when it needs none. */
export function attentionStatus(product: AttentionState, today: string): AttentionStatus | null {
  return expiryStatus(product, today) ?? (isRunningLow(product) ? "runningLow" : null);
}

/** Sorts Needs Attention: the most urgent status first. */
export function byUrgency(a: AttentionStatus, b: AttentionStatus): number {
  return attentionStatuses.indexOf(a) - attentionStatuses.indexOf(b);
}
