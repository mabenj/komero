import { ConvexError, v } from "convex/values";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { recordActivity, relinkActivities } from "./activities";
import { requireMemberId } from "./members";
import type { Doc, Id } from "./_generated/dataModel";
import { isLikelySame, nameKey, tidyName } from "./productNames";
import { removedEntries, removeEntriesOf, restoreEntriesOf } from "./shoppingList";
import { expiryKind } from "./schema";
import { applyRestock, applyUse, crossedIntoRunningLow, isDate, type StockState } from "./stock";

/**
 * Adds a Product by name to its Home Location. A new Product starts with Stock 1.
 * Both the search/add field and quick-add use this; a name that already exists
 * (in any case) is refused.
 */
export const create = mutation({
  args: { name: v.string(), locationId: v.id("locations") },
  handler: async (ctx, { name, locationId }) => {
    const memberId = await requireMemberId(ctx);
    const tidy = tidyName(name);
    if (tidy === "") throw new ConvexError("NAME_REQUIRED");
    if ((await ctx.db.get(locationId)) === null) throw new ConvexError("LOCATION_NOT_FOUND");
    const key = nameKey(tidy);
    const existing = await ctx.db
      .query("products")
      .withIndex("by_nameKey", (q) => q.eq("nameKey", key))
      .first();
    if (existing !== null) throw new ConvexError("PRODUCT_EXISTS");
    const productId = await ctx.db.insert("products", { name: tidy, nameKey: key, locationId, stock: 1 });
    await recordActivity(ctx, memberId, "create", { _id: productId, name: tidy }, { to: 1 });
    return productId;
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
      minimumStock: product.minimumStock ?? null,
      expiryKind: product.expiryKind ?? null,
      expiryDate: product.expiryDate ?? null,
      locationId: product.locationId,
      locationName: location?.name ?? "",
    };
  },
});

export const rename = mutation({
  args: { productId: v.id("products"), name: v.string() },
  handler: async (ctx, { productId, name }) => {
    const memberId = await requireMemberId(ctx);
    const tidy = tidyName(name);
    if (tidy === "") throw new ConvexError("NAME_REQUIRED");
    const product = await requireProduct(ctx, productId);
    if (tidy === product.name) return;
    await ctx.db.patch(productId, { name: tidy, nameKey: nameKey(tidy) });
    await recordActivity(ctx, memberId, "rename", { _id: productId, name: tidy }, { fromName: product.name });
  },
});

/**
 * Changes a Product's details from its page. Fields left out stay as they are;
 * null clears one. Clearing the Expiry Kind clears the Expiry Date too, and only
 * a Product with an Expiry Kind can have a date.
 */
export const update = mutation({
  args: {
    productId: v.id("products"),
    locationId: v.optional(v.id("locations")),
    minimumStock: v.optional(v.union(v.number(), v.null())),
    expiryKind: v.optional(v.union(expiryKind, v.null())),
    expiryDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { productId, locationId, minimumStock, expiryKind, expiryDate }) => {
    await requireMemberId(ctx);
    const product = await requireProduct(ctx, productId);
    if (locationId !== undefined) {
      if ((await ctx.db.get(locationId)) === null) throw new ConvexError("LOCATION_NOT_FOUND");
      await ctx.db.patch(productId, { locationId });
    }
    if (minimumStock !== undefined) {
      if (minimumStock !== null && !(Number.isInteger(minimumStock) && minimumStock >= 0)) {
        throw new ConvexError("MINIMUM_STOCK_INVALID");
      }
      await ctx.db.patch(productId, { minimumStock: minimumStock ?? undefined });
    }
    if (expiryDate != null) {
      if (!isDate(expiryDate)) throw new ConvexError("EXPIRY_DATE_INVALID");
      if (!(expiryKind ?? product.expiryKind)) throw new ConvexError("EXPIRY_KIND_REQUIRED");
    }
    if (expiryKind === null) await ctx.db.patch(productId, { expiryKind: undefined, expiryDate: undefined });
    else if (expiryKind !== undefined) await ctx.db.patch(productId, { expiryKind });
    if (expiryDate !== undefined) await ctx.db.patch(productId, { expiryDate: expiryDate ?? undefined });
  },
});

/** What the delete undo toast needs to bring a deleted Product back. */
const deletedProduct = {
  productId: v.id("products"),
  name: v.string(),
  locationId: v.id("locations"),
  stock: v.number(),
  minimumStock: v.optional(v.number()),
  expiryKind: v.optional(expiryKind),
  expiryDate: v.optional(v.string()),
  entries: removedEntries,
};

/** Deletes a Product and its Shopping List Entries. Returns what `restore` needs for the undo toast. */
export const remove = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    const memberId = await requireMemberId(ctx);
    const product = await requireProduct(ctx, productId);
    const { name, locationId, stock, minimumStock, expiryKind, expiryDate } = product;
    const entries = await removeEntriesOf(ctx, productId);
    await ctx.db.delete(productId);
    await recordActivity(ctx, memberId, "delete", product);
    return { productId, name, locationId, stock, minimumStock, expiryKind, expiryDate, entries };
  },
});

/**
 * The delete undo toast: puts the Product back as it was, with its Shopping
 * List Entries. Returns its new id, which takes over the deleted Product's Activities.
 * If its Home Location was deleted meanwhile, it goes to the first Location.
 */
export const restore = mutation({
  args: deletedProduct,
  handler: async (
    ctx,
    { productId: deletedId, name, locationId, stock, minimumStock, expiryKind, expiryDate, entries },
  ) => {
    const memberId = await requireMemberId(ctx);
    const home =
      (await ctx.db.get(locationId)) ??
      (await ctx.db.query("locations").withIndex("by_sortOrder").first());
    if (home === null) throw new ConvexError("LOCATION_NOT_FOUND");
    const productId = await ctx.db.insert("products", {
      name,
      nameKey: nameKey(name),
      locationId: home._id,
      stock,
      minimumStock,
      expiryKind,
      expiryDate,
    });
    await relinkActivities(ctx, deletedId, productId);
    await restoreEntriesOf(ctx, productId, entries);
    await recordActivity(ctx, memberId, "restore", { _id: productId, name }, { to: stock });
    return productId;
  },
});

/** Records a Stock change as an Activity, unless Stock stayed the same (a Use at 0). */
async function recordStockChange(
  ctx: MutationCtx,
  memberId: Id<"users">,
  kind: "restock" | "use" | "undoStockChange",
  product: Doc<"products">,
  to: number,
) {
  if (to !== product.stock) await recordActivity(ctx, memberId, kind, product, { from: product.stock, to });
}

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
 * Returns the Stock before and after, for the undo toast, and whether this
 * change made the Product Running Low, for the "running low" toast.
 */
export const adjustStock = mutation({
  args: { productId: v.id("products"), change: v.union(v.literal("restock"), v.literal("use")) },
  handler: async (ctx, { productId, change }) => {
    const memberId = await requireMemberId(ctx);
    const product = await ctx.db.get(productId);
    if (product === null) throw new ConvexError("PRODUCT_NOT_FOUND");
    const next = change === "restock" ? applyRestock(product, 1) : applyUse(product);
    await ctx.db.patch(productId, next);
    await recordStockChange(ctx, memberId, change, product, next.stock);
    return {
      from: product.stock,
      to: next.stock,
      crossedIntoRunningLow: crossedIntoRunningLow(product, { ...product, ...next }),
    };
  },
});

/**
 * The undo toast: reverses what an adjustStock call did (`from` → `to`) on top
 * of the current Stock, so changes made on other phones in between are kept.
 */
export const undoStockChange = mutation({
  args: { productId: v.id("products"), from: v.number(), to: v.number() },
  handler: async (ctx, { productId, from, to }) => {
    const memberId = await requireMemberId(ctx);
    const product = await ctx.db.get(productId);
    if (product === null) throw new ConvexError("PRODUCT_NOT_FOUND");
    const { stock, expiryKind, expiryDate } = product;
    let next: StockState = { stock, expiryKind, expiryDate };
    if (to < from) next = applyRestock(next, from - to);
    for (let i = 0; i < to - from; i++) next = applyUse(next);
    await ctx.db.patch(productId, next);
    await recordStockChange(ctx, memberId, "undoStockChange", product, next.stock);
  },
});
