import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { recordActivity } from "./activities";
import { requireMemberId } from "./members";
import { nameKey, tidyName } from "./productNames";

type ListedEntry = { _id: Id<"entries">; name: string; quantity: number };
type ProductEntry = ListedEntry & { productId: Id<"products">; stock: number };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fi");

/**
 * Lista: to-buy Product Entries grouped by their Product's Home Location in
 * Location order (empty Locations left out), each with the Product's current
 * Stock; then One-offs, which Lista shows under "Other".
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireMemberId(ctx);
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_state", (q) => q.eq("state", "toBuy"))
      .collect();

    const byLocation = new Map<Id<"locations">, ProductEntry[]>();
    const oneOffs: ListedEntry[] = [];
    for (const entry of entries) {
      if (entry.productId === undefined) {
        oneOffs.push({ _id: entry._id, name: entry.name ?? "", quantity: entry.quantity });
        continue;
      }
      const product = await ctx.db.get(entry.productId);
      if (product === null) continue;
      const group = byLocation.get(product.locationId) ?? [];
      group.push({
        _id: entry._id,
        productId: product._id,
        name: product.name,
        quantity: entry.quantity,
        stock: product.stock,
      });
      byLocation.set(product.locationId, group);
    }

    const locations = await ctx.db.query("locations").withIndex("by_sortOrder").collect();
    return {
      locations: locations
        .filter((location) => byLocation.has(location._id))
        .map((location) => ({
          _id: location._id,
          name: location.name,
          entries: byLocation.get(location._id)!.sort(byName),
        })),
      oneOffs: oneOffs.sort(byName),
    };
  },
});

/**
 * Need More: puts a Product on the Shopping List, or raises its Entry's
 * quantity by 1 if it is already there.
 */
export const needMore = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    const memberId = await requireMemberId(ctx);
    const product = await ctx.db.get(productId);
    if (product === null) throw new ConvexError("PRODUCT_NOT_FOUND");
    return await needMoreOf(ctx, memberId, product);
  },
});

/**
 * Lista's add field. Picking a Product from autocomplete calls `needMore`; any
 * other text lands here and becomes a One-off, unless it is a Product's name
 * after all (in any case), which links it. The same One-off again raises its quantity.
 */
export const addOneOff = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const memberId = await requireMemberId(ctx);
    const tidy = tidyName(name);
    if (tidy === "") throw new ConvexError("NAME_REQUIRED");
    const key = nameKey(tidy);
    const product = await ctx.db
      .query("products")
      .withIndex("by_nameKey", (q) => q.eq("nameKey", key))
      .first();
    if (product !== null) return await needMoreOf(ctx, memberId, product);

    const toBuy = await ctx.db
      .query("entries")
      .withIndex("by_state", (q) => q.eq("state", "toBuy"))
      .collect();
    const same = toBuy.find((entry) => entry.productId === undefined && nameKey(entry.name ?? "") === key);
    const result = await addOrRaise(ctx, same ?? null, { name: tidy, createdBy: memberId });
    await recordActivity(ctx, memberId, "addOneOff", { name: same?.name ?? tidy }, { quantity: result.quantity });
    return result;
  },
});

/** Need More of a Product. Returns the Entry and its new quantity, for the undo toast. */
async function needMoreOf(ctx: MutationCtx, memberId: Id<"users">, product: Doc<"products">) {
  const existing = await ctx.db
    .query("entries")
    .withIndex("by_product", (q) => q.eq("productId", product._id).eq("state", "toBuy"))
    .unique();
  const result = await addOrRaise(ctx, existing, { productId: product._id, createdBy: memberId });
  await recordActivity(ctx, memberId, "needMore", product, { quantity: result.quantity });
  return result;
}

async function addOrRaise(
  ctx: MutationCtx,
  existing: Doc<"entries"> | null,
  entry: { productId?: Id<"products">; name?: string; createdBy: Id<"users"> },
) {
  if (existing === null) {
    return { entryId: await ctx.db.insert("entries", { ...entry, quantity: 1, state: "toBuy" }), quantity: 1 };
  }
  const quantity = existing.quantity + 1;
  await ctx.db.patch(existing._id, { quantity });
  return { entryId: existing._id, quantity };
}

/** The Entry's quantity stepper. The quantity stays at least 1; removing an Entry is `remove`. */
export const setQuantity = mutation({
  args: { entryId: v.id("entries"), quantity: v.number() },
  handler: async (ctx, { entryId, quantity }) => {
    await requireMemberId(ctx);
    await requireEntry(ctx, entryId);
    await ctx.db.patch(entryId, { quantity: Math.max(1, Math.round(quantity)) });
  },
});

/** Deletes an Entry from the list. */
export const remove = mutation({
  args: { entryId: v.id("entries") },
  handler: async (ctx, { entryId }) => {
    const memberId = await requireMemberId(ctx);
    const entry = await requireEntry(ctx, entryId);
    const product = entry.productId && (await ctx.db.get(entry.productId));
    await ctx.db.delete(entryId);
    await recordActivity(ctx, memberId, "removeEntry", product ?? { name: entry.name ?? "" }, {
      quantity: entry.quantity,
    });
  },
});

async function requireEntry(ctx: MutationCtx, entryId: Id<"entries">) {
  const entry = await ctx.db.get(entryId);
  if (entry === null) throw new ConvexError("ENTRY_NOT_FOUND");
  return entry;
}
