import type { Id } from "./_generated/dataModel";
import { nameKey } from "./productNames";

// An optimistic update shows a new Entry before the server has made it, under a
// stand-in id (lib/listUpdates.ts). A tap on it before the add has reached the
// server sends the stand-in. A phone's mutations run in the order they were sent,
// so by then the Entry exists, and the server finds it by what the stand-in names.

export function needMoreStandIn(productId: Id<"products">) {
  return `needMore:${productId}` as Id<"entries">;
}

export function oneOffStandIn(name: string) {
  return `addOneOff:${nameKey(name)}` as Id<"entries">;
}

/** What a stand-in names: Need More's Product, or the One-off's name key. Null for a real Entry id. */
export function readStandIn(entryId: string): { productId: string } | { nameKey: string } | null {
  const colon = entryId.indexOf(":");
  if (colon === -1) return null;
  const kind = entryId.slice(0, colon);
  const named = entryId.slice(colon + 1);
  if (kind === "needMore") return { productId: named };
  if (kind === "addOneOff") return { nameKey: named };
  return null;
}
