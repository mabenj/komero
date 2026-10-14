/** A Product name as the household typed it, tidied: trimmed, single spaces. */
export function tidyName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

/** The key Product names are matched on: tidy and case-insensitive. */
export function nameKey(name: string) {
  return tidyName(name).toLowerCase();
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
