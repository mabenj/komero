import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { recordActivity } from "./activities";
import { requireMemberId } from "./members";
import { findOrCreateProduct } from "./newProduct";
import { nameKey, tidyName } from "./productNames";
import { applyRestock, isDate } from "./stock";

type ListedEntry = { _id: Id<"entries">; name: string; quantity: number };
// `asksForDate`: the Product has an Expiry Kind, so Put Away prompts for a date.
type ProductEntry = ListedEntry & { productId: Id<"products">; stock: number; asksForDate: boolean };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fi");

/**
 * Lista: to-buy Product Entries grouped by their Product's Home Location in
 * Location order (empty Locations left out), each with the Product's current
 * Stock; then One-offs, which Lista shows under "Other"; then the Bag
 * ("In the bag"), Product Entries and One-offs together.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireMemberId(ctx);
    const entries = await ctx.db.query("entries").collect();

    const byLocation = new Map<Id<"locations">, ProductEntry[]>();
    const oneOffs: ListedEntry[] = [];
    const bag: (ListedEntry | ProductEntry)[] = [];
    for (const entry of entries) {
      if (entry.productId === undefined) {
        const oneOff = { _id: entry._id, name: entry.name ?? "", quantity: entry.quantity };
        (entry.state === "inBag" ? bag : oneOffs).push(oneOff);
        continue;
      }
      const product = await ctx.db.get(entry.productId);
      if (product === null) continue;
      const listed = {
        _id: entry._id,
        productId: product._id,
        name: product.name,
        quantity: entry.quantity,
        stock: product.stock,
        asksForDate: product.expiryKind !== undefined,
      };
      if (entry.state === "inBag") {
        bag.push(listed);
        continue;
      }
      const group = byLocation.get(product.locationId) ?? [];
      group.push(listed);
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
      bag: bag.sort(byName),
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
export async function needMoreOf(ctx: MutationCtx, memberId: Id<"users">, product: Doc<"products">) {
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
    const what = await named(ctx, entry);
    await ctx.db.delete(entryId);
    await addToList(ctx, memberId, "_id" in what ? { product: what } : what, entry.quantity);
    await recordActivity(ctx, memberId, "untick", what, { quantity: entry.quantity });
  },
});

/**
 * Put Away of one Entry from the Bag: Restocks its Product by the Entry's
 * quantity, with the date from the prompt if one was given (Skip gives none);
 * a One-off just disappears.
 */
export const putAway = mutation({
  args: { entryId: v.id("entries"), expiryDate: v.optional(v.string()) },
  handler: async (ctx, { entryId, expiryDate }) => {
    const memberId = await requireMemberId(ctx);
    const entry = await requireEntry(ctx, entryId);
    if (entry.state !== "inBag") throw new ConvexError("ENTRY_NOT_IN_BAG");
    await putAwayEntry(ctx, memberId, entry, requireDate(expiryDate));
  },
});

/** "Put away all": Put Away of every Entry in the Bag, with the dates from the prompts by Product. */
export const putAwayAll = mutation({
  args: { expiryDates: v.optional(v.record(v.id("products"), v.string())) },
  handler: async (ctx, { expiryDates = {} }) => {
    const memberId = await requireMemberId(ctx);
    const bag = await ctx.db
      .query("entries")
      .withIndex("by_state", (q) => q.eq("state", "inBag"))
      .collect();
    for (const entry of bag) {
      const expiryDate = entry.productId && requireDate(expiryDates[entry.productId]);
      await putAwayEntry(ctx, memberId, entry, expiryDate);
    }
  },
});

function requireDate(date: string | undefined) {
  if (date !== undefined && !isDate(date)) throw new ConvexError("EXPIRY_DATE_INVALID");
  return date;
}

async function putAwayEntry(ctx: MutationCtx, memberId: Id<"users">, entry: Doc<"entries">, expiryDate?: string) {
  const what = await named(ctx, entry);
  await ctx.db.delete(entry._id);
  if (!("_id" in what)) {
    await recordActivity(ctx, memberId, "putAway", what, { quantity: entry.quantity });
    return;
  }
  const next = applyRestock(what, entry.quantity, expiryDate);
  await ctx.db.patch(what._id, next);
  await recordActivity(ctx, memberId, "putAway", what, { from: what.stock, to: next.stock, quantity: entry.quantity });
}

/**
 * Put Away of one package of a Product from the Bag (a scan in Add mode): its
 * Entry's quantity goes down by 1, and the Entry leaves the Bag at 0. Returns
 * the Stock before and after, or null when the Bag has none of the Product.
 */
export async function putAwayOneFromBag(ctx: MutationCtx, memberId: Id<"users">, product: Doc<"products">) {
  const entry = await ctx.db
    .query("entries")
    .withIndex("by_product", (q) => q.eq("productId", product._id).eq("state", "inBag"))
    .first();
  if (entry === null) return null;
  if (entry.quantity > 1) await ctx.db.patch(entry._id, { quantity: entry.quantity - 1 });
  else await ctx.db.delete(entry._id);
  const next = applyRestock(product, 1);
  await ctx.db.patch(product._id, next);
  await recordActivity(ctx, memberId, "putAway", product, { from: product.stock, to: next.stock, quantity: 1 });
  return { from: product.stock, to: next.stock };
}

/**
 * Turns a One-off into a Product in the chosen Home Location, Out of Stock (it
 * is still to be bought), and links the Entry to it. A name that is already a
 * Product's (in any case) links to that Product instead.
 */
export const makeProduct = mutation({
  args: { entryId: v.id("entries"), name: v.string(), locationId: v.id("locations") },
  handler: async (ctx, { entryId, name, locationId }) => {
    const memberId = await requireMemberId(ctx);
    const entry = await requireEntry(ctx, entryId);
    if (entry.productId !== undefined) throw new ConvexError("NOT_A_ONE_OFF");
    const product = await findOrCreateProduct(ctx, memberId, { name, locationId, stock: 0 });
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
