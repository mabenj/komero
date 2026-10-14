import { ConvexError, v } from "convex/values";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { requireMemberId } from "./members";
import type { Doc, Id } from "./_generated/dataModel";
import { isLikelySame, nameKey, tidyName } from "./productNames";
import { applyRestock, applyUse, type StockState } from "./stock";

/**
 * Adds a Product by name to its Home Location. A new Product starts with Stock 1.
 * Both the search/add field and quick-add use this; a name that already exists
 * (in any case) is refused.
 */
export const create = mutation({
  args: { name: v.string(), locationId: v.id("locations") },
  handler: async (ctx, { name, locationId }) => {
    await requireMemberId(ctx);
    const tidy = tidyName(name);
    if (tidy === "") throw new ConvexError("NAME_REQUIRED");
    if ((await ctx.db.get(locationId)) === null) throw new ConvexError("LOCATION_NOT_FOUND");
    const key = nameKey(tidy);
    const existing = await ctx.db
      .query("products")
      .withIndex("by_nameKey", (q) => q.eq("nameKey", key))
      .first();
    if (existing !== null) throw new ConvexError("PRODUCT_EXISTS");
    return await ctx.db.insert("products", { name: tidy, nameKey: key, locationId, stock: 1 });
  },
});

/** The Product page, or null once the Product has been deleted. */
export const get = query({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    await requireMemberId(ctx);
    const product = await ctx.db.get(productId);
    if (product === null) return null;
    const location = await ctx.db.get(product.locationId);
    return {
      _id: product._id,
      name: product.name,
      stock: product.stock,
      locationId: product.locationId,
      locationName: location?.name ?? "",
    };
  },
});

export const rename = mutation({
  args: { productId: v.id("products"), name: v.string() },
  handler: async (ctx, { productId, name }) => {
    await requireMemberId(ctx);
    const tidy = tidyName(name);
    if (tidy === "") throw new ConvexError("NAME_REQUIRED");
    await requireProduct(ctx, productId);
    await ctx.db.patch(productId, { name: tidy, nameKey: nameKey(tidy) });
  },
});

/** Changes a Product's details from its page. Fields left out stay as they are. */
export const update = mutation({
  args: { productId: v.id("products"), locationId: v.optional(v.id("locations")) },
  handler: async (ctx, { productId, locationId }) => {
    await requireMemberId(ctx);
    await requireProduct(ctx, productId);
    if (locationId !== undefined) {
      if ((await ctx.db.get(locationId)) === null) throw new ConvexError("LOCATION_NOT_FOUND");
      await ctx.db.patch(productId, { locationId });
    }
  },
});

/** What the delete undo toast needs to bring a deleted Product back. */
const deletedProduct = { name: v.string(), locationId: v.id("locations"), stock: v.number() };

/** Deletes a Product. Returns what `restore` needs for the undo toast. */
export const remove = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    await requireMemberId(ctx);
    const { name, locationId, stock } = await requireProduct(ctx, productId);
    await ctx.db.delete(productId);
    return { name, locationId, stock };
  },
});

/**
 * The delete undo toast: puts the Product back as it was. Returns its new id.
 * If its Home Location was deleted meanwhile, it goes to the first Location.
 */
export const restore = mutation({
  args: deletedProduct,
  handler: async (ctx, { name, locationId, stock }) => {
    await requireMemberId(ctx);
    const home =
      (await ctx.db.get(locationId)) ??
      (await ctx.db.query("locations").withIndex("by_sortOrder").first());
    if (home === null) throw new ConvexError("LOCATION_NOT_FOUND");
    return await ctx.db.insert("products", { name, nameKey: nameKey(name), locationId: home._id, stock });
  },
});

async function requireProduct(ctx: MutationCtx, productId: Id<"products">) {
  const product = await ctx.db.get(productId);
  if (product === null) throw new ConvexError("PRODUCT_NOT_FOUND");
  return product;
}

const MAX_MATCHES = 8;

/**
 * The search/add field: Products whose name starts with the text (any case),
 * whether the typed name can be added as a new Product, and a likely duplicate
 * to warn about.
 */
export const search = query({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    await requireMemberId(ctx);
    const name = tidyName(text);
    const key = nameKey(name);
    if (key === "") return { matches: [], canAdd: false, name, duplicate: null };

    const locationName = async (product: Doc<"products">) => (await ctx.db.get(product.locationId))?.name ?? "";

    const products = await ctx.db
      .query("products")
      .withIndex("by_nameKey", (q) => q.gte("nameKey", key).lt("nameKey", key + "￿"))
      .take(MAX_MATCHES);
    const matches = await Promise.all(
      products.map(async (product) => ({
        _id: product._id,
        name: product.name,
        stock: product.stock,
        locationName: await locationName(product),
      })),
    );

    // A household has hundreds of Products at most, so near-duplicates are found by a full scan.
    const all = await ctx.db.query("products").collect();
    const same = all.find((product) => product.nameKey === key);
    const close = same ?? all.find((product) => isLikelySame(product.nameKey, key));
    const duplicate = close ? { name: close.name, locationName: await locationName(close) } : null;
    return { matches, canAdd: !same, name, duplicate };
  },
});

/**
 * Koti's inline + (Restock 1) and – (Use 1). A read-modify-write inside one
 * mutation, so concurrent taps on different phones all count.
 * Returns the Stock before and after, for the undo toast.
 */
export const adjustStock = mutation({
  args: { productId: v.id("products"), change: v.union(v.literal("restock"), v.literal("use")) },
  handler: async (ctx, { productId, change }) => {
    await requireMemberId(ctx);
    const product = await ctx.db.get(productId);
    if (product === null) throw new ConvexError("PRODUCT_NOT_FOUND");
    const next = change === "restock" ? applyRestock(product, 1) : applyUse(product);
    await ctx.db.patch(productId, next);
    return { from: product.stock, to: next.stock };
  },
});

/**
 * The undo toast: reverses what an adjustStock call did (`from` → `to`) on top
 * of the current Stock, so changes made on other phones in between are kept.
 */
export const undoStockChange = mutation({
  args: { productId: v.id("products"), from: v.number(), to: v.number() },
  handler: async (ctx, { productId, from, to }) => {
    await requireMemberId(ctx);
    const product = await ctx.db.get(productId);
    if (product === null) throw new ConvexError("PRODUCT_NOT_FOUND");
    let next: StockState = { stock: product.stock };
    if (to < from) next = applyRestock(next, from - to);
    for (let i = 0; i < to - from; i++) next = applyUse(next);
    await ctx.db.patch(productId, next);
  },
});
