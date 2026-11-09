import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireMemberId } from "./members";

const DAY_MS = 24 * 60 * 60 * 1000;

// The Activities that Restock a Product, and the undos that take one back.
const KINDS = ["restock", "putAway", "undoStockChange", "undoPutAway"] as const;

/**
 * Frequently Bought, for Komero's tile: each Product restocked in the last 90
 * days, with how many different days it was restocked on. Activities older
 * than that are purged daily, so every one left counts (and the table stays
 * small enough to read whole).
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireMemberId(ctx);
    const activities = await Promise.all(
      KINDS.map((kind) =>
        ctx.db
          .query("activities")
          .withIndex("by_kind", (q) => q.eq("kind", kind))
          .collect(),
      ),
    );
    return restockDays(activities.flat());
  },
});

/**
 * On how many days each Product was restocked. An undo that took Stock back
 * down cancels that Product's latest Restock. Days are UTC days: close enough
 * for a household in Finland, where a day turns over at 2–3 am.
 */
export function restockDays(activities: Doc<"activities">[]) {
  const restocks = new Map<Id<"products">, number[]>();
  for (const activity of [...activities].sort((a, b) => a._creationTime - b._creationTime)) {
    if (activity.productId === undefined) continue;
    const times = restocks.get(activity.productId) ?? [];
    restocks.set(activity.productId, times);
    if (activity.kind === "restock" || activity.kind === "putAway") times.push(activity._creationTime);
    else if ((activity.to ?? 0) < (activity.from ?? 0)) times.pop();
  }
  return [...restocks].flatMap(([productId, times]) => {
    const days = new Set(times.map((time) => Math.floor(time / DAY_MS))).size;
    return days > 0 ? [{ productId, days }] : [];
  });
}
