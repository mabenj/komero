import type { Doc, Id } from "./_generated/dataModel";

/** A Product name as the household typed it, tidied: trimmed, single spaces. */
export function tidyName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

/** The key Product names are matched on: tidy and case-insensitive. */
export function nameKey(name: string) {
  return tidyName(name).toLowerCase();
}

/** What the search knows of a Product: what an option shows, and the Location the duplicate warning names. */
export type SearchableProduct = {
  _id: Id<"products">;
  name: string;
  stock: number;
  expiryKind: NonNullable<Doc<"products">["expiryKind"]> | null;
  locationName: string;
};

const MAX_MATCHES = 8;

/**
 * The search/add field: Products whose name contains the text (any case), those
 * starting with it first; whether the typed name can be added as a new Product;
 * and a likely duplicate to warn about. Plain code, so the phone runs the same
 * search on the Products it already has while the server's answer is on its way.
 */
export function searchProducts(products: SearchableProduct[], text: string) {
  const name = tidyName(text);
  const key = nameKey(name);
  if (key === "") return { matches: [] as SearchableProduct[], canAdd: false, name, duplicate: null };

  const keyed = products.map((product) => ({ product, key: nameKey(product.name) }));
  const startsFirst = (k: string) => (k.startsWith(key) ? 0 : 1);
  const matches = keyed
    .filter((p) => p.key.includes(key))
    .sort((a, b) => startsFirst(a.key) - startsFirst(b.key) || a.key.localeCompare(b.key))
    .slice(0, MAX_MATCHES)
    .map((p) => p.product);

  const same = keyed.find((p) => p.key === key);
  const close = same ?? keyed.find((p) => isLikelySame(p.key, key));
  const duplicate = close ? { name: close.product.name, locationName: close.product.locationName } : null;
  return { matches, canAdd: !same, name, duplicate };
}

/**
 * Whether two name keys likely mean the same Product: equal once ä/ö/å are
 * read as a/o, or (for names of 4+ letters) one typo apart.
 */
export function isLikelySame(keyA: string, keyB: string) {
  const a = withoutAccents(keyA);
  const b = withoutAccents(keyB);
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 4 && withinOneEdit(a, b);
}

function withoutAccents(key: string) {
  return key.normalize("NFD").replace(/\p{M}/gu, "");
}

/** True when one insertion, deletion or substitution turns a into b. */
function withinOneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return a.length - i - j <= 1 && b.length - i - j <= 1;
}
