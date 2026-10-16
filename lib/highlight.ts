import { nameKey } from "../convex/productNames";

/** A name split around the first place it contains the typed text (any case): before, match, after. */
export function splitAtMatch(name: string, text: string): [string, string, string] {
  const key = nameKey(text);
  const at = key === "" ? -1 : name.toLowerCase().indexOf(key);
  if (at === -1) return [name, "", ""];
  return [name.slice(0, at), name.slice(at, at + key.length), name.slice(at + key.length)];
}
