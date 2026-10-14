import { ConvexError, type Infer, v } from "convex/values";
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
    const product = await ctx.db
      .query("products")
      .withIndex("by_nameKey", (q) => q.eq("nameKey", nameKey(tidy)))
      .first();
    if (product !== null) return await needMoreOf(ctx, memberId, product);
    const added = await addToList(ctx, memberId, { name: tidy }, 1);
    await recordActivity(ctx, memberId, "addOneOff", { name: added.name }, { quantity: added.quantity });
    return added;
  },
});

/** Need More of a Product. Returns the Entry and its new quantity, for the undo toast. */
async function needMoreOf(ctx: MutationCtx, memberId: Id<"users">, product: Doc<"products">) {
  const added = await addToList(ctx, memberId, { product }, 1);
  await recordActivity(ctx, memberId, "needMore", product, { quantity: added.quantity });
  return added;
}

/**
 * Adds `amount` to the to-buy Entry for a Product or a One-off name, creating
 * it if there is none, so the list never holds the same thing twice.
 */
async function addToList(
  ctx: MutationCtx,
  memberId: Id<"users">,
  what: { product: Doc<"products"> } | { name: string },
  amount: number,
) {
  const existing =
    "product" in what
      ? await ctx.db
          .query("entries")
          .withIndex("by_product", (q) => q.eq("productId", what.product._id).eq("state", "toBuy"))
          .unique()
      : (
          await ctx.db
            .query("entries")
            .withIndex("by_state", (q) => q.eq("state", "toBuy"))
            .collect()
        ).find((entry) => entry.productId === undefined && nameKey(entry.name ?? "") === nameKey(what.name));
  const name = "product" in what ? what.product.name : (existing?.name ?? what.name);
  if (existing === null || existing === undefined) {
    const link = "product" in what ? { productId: what.product._id } : { name };
    const entryId = await ctx.db.insert("entries", { ...link, quantity: amount, state: "toBuy", createdBy: memberId });
    return { entryId, name, quantity: amount };
  }
  const quantity = existing.quantity + amount;
  await ctx.db.patch(existing._id, { quantity });
  return { entryId: existing._id, name, quantity };
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

/** Deletes an Entry from the list. Returns what `restore` needs for the undo toast. */
export const remove = mutation({
  args: { entryId: v.id("entries") },
  handler: async (ctx, { entryId }) => {
    const memberId = await requireMemberId(ctx);
    const entry = await requireEntry(ctx, entryId);
    const product = entry.productId && (await ctx.db.get(entry.productId));
    const name = product ? product.name : (entry.name ?? "");
    await ctx.db.delete(entryId);
    await recordActivity(ctx, memberId, "removeEntry", product ?? { name }, { quantity: entry.quantity });
    return { productId: entry.productId, name, quantity: entry.quantity };
  },
});

/**
 * The Entry delete undo toast: puts the Entry back on the list. If it was put
 * on the list again meanwhile, the quantities add up. Nothing happens if its
 * Product has been deleted since.
 */
export const restore = mutation({
  args: { productId: v.optional(v.id("products")), name: v.string(), quantity: v.number() },
  handler: async (ctx, { productId, name, quantity }) => {
    const memberId = await requireMemberId(ctx);
    const product = productId && (await ctx.db.get(productId));
    if (product === null) return;
    const restored = await addToList(ctx, memberId, product ? { product } : { name }, quantity);
    await recordActivity(ctx, memberId, "restoreEntry", product ?? { name: restored.name }, {
      quantity: restored.quantity,
    });
  },
});

async function requireEntry(ctx: MutationCtx, entryId: Id<"entries">) {
  const entry = await ctx.db.get(entryId);
  if (entry === null) throw new ConvexError("ENTRY_NOT_FOUND");
  return entry;
}

/** What a deleted Product's undo needs to put its Entries back. */
export const removedEntries = v.array(
  v.object({ quantity: v.number(), state: v.union(v.literal("toBuy"), v.literal("inBag")), createdBy: v.id("users") }),
);

/** Deleting a Product takes its Entries off the list. Returns them for the undo toast. */
export async function removeEntriesOf(ctx: MutationCtx, productId: Id<"products">) {
  const entries = await ctx.db
    .query("entries")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
  for (const entry of entries) await ctx.db.delete(entry._id);
  return entries.map(({ quantity, state, createdBy }) => ({ quantity, state, createdBy }));
}

/** The Product delete undo: puts its Entries back, linked to the restored Product. */
export async function restoreEntriesOf(
  ctx: MutationCtx,
  productId: Id<"products">,
  entries: Infer<typeof removedEntries>,
) {
  for (const entry of entries) await ctx.db.insert("entries", { productId, ...entry });
}
