import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { requireMemberId } from "./members";
import { tidyName } from "./productNames";

// Location names are household text, not UI copy, so they are never translated.
const DEFAULT_LOCATIONS = ["Jääkaappi", "Pakastin", "Kaappi", "Kylpyhuone", "Siivouskomero"];

export async function seedDefaultLocations(ctx: MutationCtx) {
  if ((await ctx.db.query("locations").first()) !== null) return;
  for (const [sortOrder, name] of DEFAULT_LOCATIONS.entries()) {
    await ctx.db.insert("locations", { name, sortOrder });
  }
}

/** Adds a Location after the existing ones. */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireMemberId(ctx);
    const last = await ctx.db.query("locations").withIndex("by_sortOrder").order("desc").first();
    return await ctx.db.insert("locations", { name: requiredName(name), sortOrder: (last?.sortOrder ?? -1) + 1 });
  },
});

export const rename = mutation({
  args: { locationId: v.id("locations"), name: v.string() },
  handler: async (ctx, { locationId, name }) => {
    await requireMemberId(ctx);
    await requireLocation(ctx, locationId);
    await ctx.db.patch(locationId, { name: requiredName(name) });
  },
});

/**
 * Puts the Locations in the given order. Locations missing from the list (say,
 * one just added on another phone) keep their order after the listed ones, and
 * listed ones that no longer exist are skipped.
 */
export const reorder = mutation({
  args: { locationIds: v.array(v.id("locations")) },
  handler: async (ctx, { locationIds }) => {
    await requireMemberId(ctx);
    await putInOrder(ctx, await ctx.db.query("locations").withIndex("by_sortOrder").collect(), locationIds);
  },
});

/**
 * Renumbers Locations or Categories (`current`, in their current order) to
 * follow `ids`: ones missing from `ids` keep their order after the listed ones.
 */
export async function putInOrder<T extends Doc<"locations"> | Doc<"categories">>(
  ctx: MutationCtx,
  current: T[],
  ids: T["_id"][],
) {
  const rank = (id: T["_id"]) => {
    const index = ids.indexOf(id);
    return index === -1 ? ids.length : index;
  };
  const sorted = [...current].sort((a, b) => rank(a._id) - rank(b._id));
  for (const [sortOrder, row] of sorted.entries()) {
    if (row.sortOrder !== sortOrder) await ctx.db.patch(row._id, { sortOrder });
  }
}

/**
 * Deletes a Location. An empty one goes straight away; one that still has
 * Products needs `moveProductsTo`, and every Product moves there first, so
 * Products are never lost as a side effect. The last Location can't go.
 */
export const remove = mutation({
  args: { locationId: v.id("locations"), moveProductsTo: v.optional(v.id("locations")) },
  handler: async (ctx, { locationId, moveProductsTo }) => {
    await requireMemberId(ctx);
    await requireLocation(ctx, locationId);
    const locations = await ctx.db.query("locations").take(2);
    if (locations.length < 2) throw new ConvexError("LAST_LOCATION");

    const products = await ctx.db
      .query("products")
      .withIndex("by_location", (q) => q.eq("locationId", locationId))
      .collect();
    if (products.length > 0) {
      if (moveProductsTo === undefined) throw new ConvexError("MOVE_TARGET_REQUIRED");
      if (moveProductsTo === locationId || (await ctx.db.get(moveProductsTo)) === null) {
        throw new ConvexError("MOVE_TARGET_INVALID");
      }
      for (const product of products) await ctx.db.patch(product._id, { locationId: moveProductsTo });
    }
    await ctx.db.delete(locationId);
  },
});

/** A Location's or Category's name, tidied; it can't be empty. */
export function requiredName(name: string) {
  const tidy = tidyName(name);
  if (tidy === "") throw new ConvexError("NAME_REQUIRED");
  return tidy;
}

async function requireLocation(ctx: MutationCtx, locationId: Id<"locations">) {
  const location = await ctx.db.get(locationId);
  if (location === null) throw new ConvexError("LOCATION_NOT_FOUND");
  return location;
}
