import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query, type QueryCtx } from "./_generated/server";
import { recordActivity } from "./activities";
import { requireMemberId } from "./members";
import { findOrCreateProduct } from "./newProduct";
import { nameKey, tidyName } from "./productNames";
import { applyRestock, applyUndo, isDate, stockChange } from "./stock";

type ListedEntry = { _id: Id<"entries">; name: string; quantity: number };
// `asksForDate`: the Product has an Expiry Kind, so Put Away prompts for a date.
type ProductEntry = ListedEntry & {
  productId: Id<"products">;
  categoryId: Id<"categories"> | null;
  stock: number;
  asksForDate: boolean;
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fi");

/**
 * Lista: to-buy Entries grouped by their Product's Category in walking order
 * (empty Categories left out), each with the Product's current Stock; then
 * `other`, Products without a Category and One-offs together; then the Bag
 * ("In the bag"), grouped the same way. Entries are by name within each group.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireMemberId(ctx);
    const entries = await ctx.db.query("entries").collect();
    const toBuy: (ListedEntry | ProductEntry)[] = [];
    const bag: (ListedEntry | ProductEntry)[] = [];
    for (const entry of entries) {
      const listed = await listedEntry(ctx, entry);
      if (listed) (entry.state === "inBag" ? bag : toBuy).push(listed);
    }
    const categories = await ctx.db.query("categories").withIndex("by_sortOrder").collect();
    return { ...groupedByCategory(toBuy, categories), bag: groupedByCategory(bag, categories) };
  },
});

/** An Entry as Lista shows it, or null if its Product is gone. */
async function listedEntry(ctx: QueryCtx, entry: Doc<"entries">): Promise<ListedEntry | ProductEntry | null> {
  if (entry.productId === undefined) return { _id: entry._id, name: entry.name ?? "", quantity: entry.quantity };
  const product = await ctx.db.get(entry.productId);
  if (product === null) return null;
  return {
    _id: entry._id,
    productId: product._id,
    categoryId: product.categoryId ?? null,
    name: product.name,
    quantity: entry.quantity,
    stock: product.stock,
    asksForDate: product.expiryKind !== undefined,
  };
}

function groupedByCategory(entries: (ListedEntry | ProductEntry)[], categories: Doc<"categories">[]) {
  const categoryOf = (entry: ListedEntry | ProductEntry) => ("categoryId" in entry ? entry.categoryId : null);
  return {
    categories: categories
      .map(({ _id, name }) => ({
        _id,
        name,
        entries: entries.filter((entry): entry is ProductEntry => categoryOf(entry) === _id).sort(byName),
      }))
      .filter((category) => category.entries.length > 0),
    other: entries.filter((entry) => categoryOf(entry) === null).sort(byName),
  };
}

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

/** Need More of a Product, `quantity` at once. Returns the Entry and its new quantity, for the undo toast. */
export async function needMoreOf(ctx: MutationCtx, memberId: Id<"users">, product: Doc<"products">, quantity = 1) {
  const added = await addToList(ctx, memberId, { product }, quantity);
  await recordActivity(ctx, memberId, "needMore", product, { quantity: added.quantity });
  return added;
}

/**
 * Adds `quantity` to the Entry for a Product or a One-off name in `state` (on
 * the list, or in the Bag when a Put Away is undone), creating it if there is
 * none, so the list never holds the same thing twice.
 */
async function addToList(
  ctx: MutationCtx,
  memberId: Id<"users">,
  productOrOneOff: { product: Doc<"products"> } | { name: string },
  quantity: number,
  state: "toBuy" | "inBag" = "toBuy",
) {
  const existing =
    "product" in productOrOneOff
      ? await ctx.db
          .query("entries")
          .withIndex("by_product", (q) => q.eq("productId", productOrOneOff.product._id).eq("state", state))
          .first()
      : (
          await ctx.db
            .query("entries")
            .withIndex("by_state", (q) => q.eq("state", state))
            .collect()
        ).find((entry) => entry.productId === undefined && nameKey(entry.name ?? "") === nameKey(productOrOneOff.name));
  const name = "product" in productOrOneOff ? productOrOneOff.product.name : (existing?.name ?? productOrOneOff.name);
  if (!existing) {
    const link = "product" in productOrOneOff ? { productId: productOrOneOff.product._id } : { name };
    const entryId = await ctx.db.insert("entries", { ...link, quantity, state, createdBy: memberId });
    return { entryId, name, quantity };
  }
  const total = existing.quantity + quantity;
  await ctx.db.patch(existing._id, { quantity: total });
  return { entryId: existing._id, name, quantity: total };
}

/** Takes `quantity` back off an Entry, removing it at 0 (as `remove` does). Nothing happens if it is gone. */
export async function takeOffList(ctx: MutationCtx, memberId: Id<"users">, entryId: Id<"entries">, quantity: number) {
  const entry = await ctx.db.get(entryId);
  if (entry === null) return;
  if (entry.quantity > quantity) return await ctx.db.patch(entryId, { quantity: entry.quantity - quantity });
  await deleteEntry(ctx, memberId, entry);
}

/** Deletes an Entry and records it. Returns the name it had on the list. */
async function deleteEntry(ctx: MutationCtx, memberId: Id<"users">, entry: Doc<"entries">) {
  const product = entry.productId && (await ctx.db.get(entry.productId));
  const name = product ? product.name : (entry.name ?? "");
  await ctx.db.delete(entry._id);
  await recordActivity(ctx, memberId, "removeEntry", product ?? { name }, { quantity: entry.quantity });
  return name;
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
    const name = await deleteEntry(ctx, memberId, entry);
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

/** Ticks an Entry off in the shop: it moves to the Bag. Stock is unchanged until it is put away. */
export const tick = mutation({
  args: { entryId: v.id("entries") },
  handler: async (ctx, { entryId }) => {
    const memberId = await requireMemberId(ctx);
    const entry = await requireEntry(ctx, entryId);
    if (entry.state === "inBag") return;
    await ctx.db.patch(entryId, { state: "inBag" });
    await recordActivity(ctx, memberId, "tick", await named(ctx, entry), { quantity: entry.quantity });
  },
});

/**
 * Takes an Entry out of the Bag, back onto the list (also the tick undo toast).
 * If the same thing was put on the list again meanwhile, the quantities add up.
 */
export const untick = mutation({
  args: { entryId: v.id("entries") },
  handler: async (ctx, { entryId }) => {
    const memberId = await requireMemberId(ctx);
    const entry = await requireEntry(ctx, entryId);
    if (entry.state === "toBuy") return;
    const productOrOneOff = await named(ctx, entry);
    await ctx.db.delete(entryId);
    const listed = "_id" in productOrOneOff ? { product: productOrOneOff } : productOrOneOff;
    await addToList(ctx, memberId, listed, entry.quantity);
    await recordActivity(ctx, memberId, "untick", productOrOneOff, { quantity: entry.quantity });
  },
});

/**
 * What undoing a Put Away needs for each Entry: the Product, how many were put
 * away and the Stock change (see `applyUndo`), or a One-off's name and quantity.
 */
const putAwayRecord = v.union(
  v.object({ productId: v.id("products"), quantity: v.number(), ...stockChange.fields }),
  v.object({ name: v.string(), quantity: v.number() }),
);
type PutAwayRecord = Infer<typeof putAwayRecord>;

/**
 * Put Away of one Entry from the Bag: Restocks its Product by the Entry's
 * quantity, with the date from the prompt if one was given (Skip gives none);
 * a One-off just disappears. Returns what `undoPutAway` needs.
 */
export const putAway = mutation({
  args: { entryId: v.id("entries"), expiryDate: v.optional(v.string()) },
  handler: async (ctx, { entryId, expiryDate }) => {
    const memberId = await requireMemberId(ctx);
    const entry = await requireEntry(ctx, entryId);
    if (entry.state !== "inBag") throw new ConvexError("ENTRY_NOT_IN_BAG");
    return { putAway: [await putAwayEntry(ctx, memberId, entry, requireDate(expiryDate))] };
  },
});

/**
 * "Put away all": Put Away of every Entry in the Bag, with the dates from the
 * prompts by Product. Returns what `undoPutAway` needs.
 */
export const putAwayAll = mutation({
  args: { expiryDates: v.optional(v.record(v.id("products"), v.string())) },
  handler: async (ctx, { expiryDates = {} }) => {
    const memberId = await requireMemberId(ctx);
    const bag = await ctx.db
      .query("entries")
      .withIndex("by_state", (q) => q.eq("state", "inBag"))
      .collect();
    const putAway: PutAwayRecord[] = [];
    for (const entry of bag) {
      const expiryDate = entry.productId && requireDate(expiryDates[entry.productId]);
      putAway.push(await putAwayEntry(ctx, memberId, entry, expiryDate));
    }
    return { putAway };
  },
});

function requireDate(date: string | undefined) {
  if (date !== undefined && !isDate(date)) throw new ConvexError("EXPIRY_DATE_INVALID");
  return date;
}

async function putAwayEntry(
  ctx: MutationCtx,
  memberId: Id<"users">,
  entry: Doc<"entries">,
  expiryDate?: string,
): Promise<PutAwayRecord> {
  const productOrOneOff = await named(ctx, entry);
  const { quantity } = entry;
  await ctx.db.delete(entry._id);
  if (!("_id" in productOrOneOff)) {
    await recordActivity(ctx, memberId, "putAway", productOrOneOff, { quantity });
    return { name: productOrOneOff.name, quantity };
  }
  return await restockFromBag(ctx, memberId, productOrOneOff, quantity, expiryDate);
}

/** Restocks a Product by `quantity` taken from the Bag, and records the Put Away. */
async function restockFromBag(
  ctx: MutationCtx,
  memberId: Id<"users">,
  product: Doc<"products">,
  quantity: number,
  expiryDate?: string,
) {
  const next = applyRestock(product, quantity, expiryDate);
  await ctx.db.patch(product._id, next);
  await recordActivity(ctx, memberId, "putAway", product, { from: product.stock, to: next.stock, quantity });
  return { productId: product._id, quantity, from: product.stock, to: next.stock, expiryDateBefore: product.expiryDate };
}

/**
 * The undo toast after Put Away or "Put away all": each Entry goes back into
 * the Bag (joining an Entry there for the same thing), and each Product's
 * Stock and Expiry Date go back as they were (see `applyUndo`). A Product
 * deleted since is skipped.
 */
export const undoPutAway = mutation({
  args: { putAway: v.array(putAwayRecord) },
  handler: async (ctx, { putAway }) => {
    const memberId = await requireMemberId(ctx);
    for (const record of putAway) {
      if (!("productId" in record)) {
        const { name } = await addToList(ctx, memberId, { name: record.name }, record.quantity, "inBag");
        await recordActivity(ctx, memberId, "undoPutAway", { name }, { quantity: record.quantity });
        continue;
      }
      const product = await ctx.db.get(record.productId);
      if (product === null) continue;
      await addToList(ctx, memberId, { product }, record.quantity, "inBag");
      const next = applyUndo(product, record);
      await ctx.db.patch(product._id, next);
      await recordActivity(ctx, memberId, "undoPutAway", product, {
        from: product.stock,
        to: next.stock,
        quantity: record.quantity,
      });
    }
  },
});

/**
 * Turns a One-off into a Product in the chosen Location (and Category, if
 * one is chosen), Out of Stock (it is still to be bought), and links the Entry
 * to it. A name that is already a Product's (in any case) links to that
 * Product instead.
 */
export const makeProduct = mutation({
  args: {
    entryId: v.id("entries"),
    name: v.string(),
    locationId: v.id("locations"),
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
  },
  handler: async (ctx, { entryId, name, locationId, categoryId }) => {
    const memberId = await requireMemberId(ctx);
    const entry = await requireEntry(ctx, entryId);
    if (entry.productId !== undefined) throw new ConvexError("NOT_A_ONE_OFF");
    const product = await findOrCreateProduct(ctx, memberId, {
      name,
      locationId,
      categoryId: categoryId ?? undefined,
      stock: 0,
    });
    if (entry.state === "toBuy") {
      await ctx.db.delete(entryId);
      await addToList(ctx, memberId, { product }, entry.quantity);
    } else {
      await ctx.db.patch(entryId, { productId: product._id, name: undefined });
    }
    return product._id;
  },
});

/** What an Activity about an Entry names: its Product, or the One-off's text. */
async function named(ctx: MutationCtx, entry: Doc<"entries">) {
  const product = entry.productId && (await ctx.db.get(entry.productId));
  return product ?? { name: entry.name ?? "" };
}

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
