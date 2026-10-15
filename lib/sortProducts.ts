import type { ExpiryKind } from "@/convex/stock";
import type { Lang } from "./i18n/translate";

export type SortColumn = "name" | "expiry" | "stock";
export type SortDirection = "asc" | "desc";

type Sortable = { name: string; stock: number; expiryKind?: ExpiryKind | null; expiryDate?: string | null };

/**
 * Koti's order for a Location's Products: by name in the UI language, Expiry
 * Date or Stock, ties by name. Products without an Expiry Date go last both ways.
 */
export function sortProducts<T extends Sortable>(products: T[], column: SortColumn, direction: SortDirection, lang: Lang): T[] {
  const sign = direction === "asc" ? 1 : -1;
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, lang);
  const expiry = (product: T) => (product.expiryKind && product.expiryDate) || null;
  const byColumn = (a: T, b: T) => {
    if (column === "name") return sign * byName(a, b);
    if (column === "stock") return sign * (a.stock - b.stock);
    const [expiryA, expiryB] = [expiry(a), expiry(b)];
    if (expiryA === expiryB) return 0;
    if (expiryA === null || expiryB === null) return expiryA === null ? 1 : -1;
    return sign * (expiryA < expiryB ? -1 : 1);
  };
  return [...products].sort((a, b) => byColumn(a, b) || byName(a, b));
}
