import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, action, mutation, query } from "./_generated/server";
import { requireMemberId } from "./members";
import { type ScanMode, scanMode } from "./scanModes";
import { createProduct, findProductNamed } from "./newProduct";
import { changeStock, deleteProduct, undoStockChangeOf } from "./products";
import { needMoreOf, takeOffList } from "./shoppingList";
import { applyRestock, type ExpiryKind, expiryKind, isDate, stockChange } from "./stock";


/**
 * Codes are matched as strings. A UPC-A read as 12 digits is stored as its
 * 13-digit EAN form (leading 0), which is how the scanner usually reports it.
 */
function normalizeBarcode(code: string) {
  const trimmed = code.trim();
  return /^\d{12}$/.test(trimmed) ? `0${trimmed}` : trimmed;
}

/** How many packages the unknown barcode card sends (1 if left out), and the date printed on them. */
const packages = { quantity: v.optional(v.number()), expiryDate: v.optional(v.string()) };

/** A card's quantity is a whole number of packages, 1 or more. */
function requireQuantity(quantity = 1) {
  if (!(Number.isInteger(quantity) && quantity >= 1)) throw new ConvexError("QUANTITY_INVALID");
  return quantity;
}

/**
 * One scan in the chosen mode. A barcode no Product has comes back unknown,
 * for the unknown barcode card; its send (`link` or `linkNew`) then applies the mode.
 */
export const scan = mutation({
  args: { code: v.string(), mode: scanMode },
  handler: async (ctx, { code, mode }) => {
    const memberId = await requireMemberId(ctx);
    const normalized = normalizeBarcode(code);
    const barcode = await findBarcode(ctx, normalized);
    const product = barcode && (await ctx.db.get(barcode.productId));
    if (!product) return { unknown: true as const, code: normalized };
    return await applyMode(ctx, memberId, product, mode);
  },
});

const OPEN_FOOD_FACTS_FIELDS = "product_name,product_name_fi,product_name_en,generic_name,generic_name_fi,product_type";

type OpenFoodFactsProduct = Partial<Record<"product_type" | `${"product" | "generic"}_name${"" | "_fi" | "_en"}`, string>>;

/**
 * Asks Open Food Facts what an unknown barcode is, for the New Product name.
 * A food match suggests Best Before. Anything else (not found, rate-limited,
 * offline, garbled) is simply no suggestion: the Member types a name.
 */
export const lookup = action({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<{ name: string | null; expiryKind: ExpiryKind | null }> => {
    await requireMemberId(ctx);
    const product = /^\d{8,14}$/.test(code) ? await fetchOpenFoodFactsProduct(code) : null;
    if (!product) return { name: null, expiryKind: null };
    const name =
      [product.product_name_fi, product.product_name, product.product_name_en, product.generic_name_fi, product.generic_name]
        .map((text) => text?.trim())
        .find((text) => text) ?? null;
    return { name, expiryKind: product.product_type === "food" ? "bestBefore" : null };
  },
});

/** The product Open Food Facts has for a code, or null for any kind of miss or failure. */
async function fetchOpenFoodFactsProduct(code: string): Promise<OpenFoodFactsProduct | null> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 5000);
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${code}?fields=${OPEN_FOOD_FACTS_FIELDS}&product_type=all`,
      {
        headers: { "User-Agent": "Komero/1.0 (https://github.com/mabenj/komero)", Accept: "application/json" },
        signal: timeout.signal,
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: { id?: string }; product?: OpenFoodFactsProduct } | null;
    return body?.result?.id === "product_found" ? (body.product ?? null) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "It's an existing Product" for an unknown barcode: links it, then applies
 * the scan mode `quantity` times with the packages' date (see `applyMode`).
 * Without a mode it only links (the Barcode remove undo toast). Returns what
 * `undoSend` needs.
 */
export const link = mutation({
  args: { code: v.string(), productId: v.id("products"), mode: v.optional(scanMode), ...packages },
  handler: async (ctx, { code, productId, mode, quantity, expiryDate }) => {
    const memberId = await requireMemberId(ctx);
    const product = await ctx.db.get(productId);
    if (product === null) throw new ConvexError("PRODUCT_NOT_FOUND");
    const normalized = normalizeBarcode(code);
    await linkCode(ctx, normalized, productId);
    if (mode === undefined) return null;
    const applied = await applyMode(ctx, memberId, product, mode, requireQuantity(quantity), expiryDate);
    return { ...applied, created: false, code: normalized };
  },
});

/** Removes a wrong Barcode from its Product. Returns what `link` needs for the undo toast. */
export const remove = mutation({
  args: { barcodeId: v.id("barcodes") },
  handler: async (ctx, { barcodeId }) => {
    await requireMemberId(ctx);
    const barcode = await ctx.db.get(barcodeId);
    if (barcode === null) throw new ConvexError("BARCODE_NOT_FOUND");
    await ctx.db.delete(barcodeId);
    return { code: barcode.code, productId: barcode.productId };
  },
});

/**
 * The unknown barcode card's send: creates the Product Out of Stock in the
 * chosen Location (and Category and Expiry Kind, if chosen), links the barcode
 * and applies the scan mode `quantity` times with the packages' date (see
 * `applyMode`), so Add ×3 leaves it at Stock 3. A name that is already a
 * Product's (in any case) links to that Product instead, leaving its details
 * as they are. Returns what `undoSend` needs.
 */
export const linkNew = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    locationId: v.id("locations"),
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
    mode: scanMode,
    expiryKind: v.optional(v.union(expiryKind, v.null())),
    ...packages,
  },
  handler: async (ctx, { code, name, locationId, categoryId, mode, expiryKind, quantity, expiryDate }) => {
    const memberId = await requireMemberId(ctx);
    const existing = await findProductNamed(ctx, name);
    const product =
      existing ??
      (await createProduct(ctx, memberId, {
        name,
        locationId,
        categoryId: categoryId ?? undefined,
        stock: 0,
        expiryKind: expiryKind ?? undefined,
      }));
    const normalized = normalizeBarcode(code);
    await linkCode(ctx, normalized, product._id);
    const applied = await applyMode(ctx, memberId, product, mode, requireQuantity(quantity), expiryDate);
    return { ...applied, created: existing === null, code: normalized };
  },
});

/**
 * The card's "Already at home" line: the Product the typed name already
 * belongs to (in any case), which `linkNew` would add the barcode to, or null.
 */
export const productNamed = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireMemberId(ctx);
    const product = await findProductNamed(ctx, name);
    if (product === null) return null;
    const location = await ctx.db.get(product.locationId);
    return {
      _id: product._id,
      name: product.name,
      locationName: location?.name ?? "",
      expiryKind: product.expiryKind ?? null,
    };
  },
});

/**
 * The undo toast after the card's send. A send that created its Product
 * deletes it, with its Barcodes and any Entry. Otherwise the Barcode is
 * unlinked and the Stock change is reversed (see `applyUndo`), or in Need more
 * the `added` packages come back off the Entry. Returns whether the undo made
 * the Product Running Low, for the "running low" toast.
 */
export const undoSend = mutation({
  args: {
    code: v.string(),
    productId: v.id("products"),
    created: v.boolean(),
    ...stockChange.fields,
    entryId: v.optional(v.id("entries")),
    added: v.number(),
  },
  handler: async (ctx, { code, productId, created, entryId, added, ...change }) => {
    const memberId = await requireMemberId(ctx);
    const product = await ctx.db.get(productId);
    if (product === null) return { crossedIntoRunningLow: false };
    if (created) {
      await deleteProduct(ctx, memberId, product);
      return { crossedIntoRunningLow: false };
    }
    const barcode = await findBarcode(ctx, code);
    if (barcode?.productId === productId) await ctx.db.delete(barcode._id);
    if (entryId !== undefined) await takeOffList(ctx, memberId, entryId, added);
    return await undoStockChangeOf(ctx, memberId, product, change);
  },
});

/**
 * The answer to the date prompt after an Add scan: the date printed on the
 * scanned package, applied as if it had come with the Restock. The scan's
 * undated Restock cleared the Expiry Date if Stock was 0 before it and kept it
 * otherwise, so keeping the earlier of that and this date gives the same
 * result: the new date from 0, the earlier of the two after.
 */
export const dateScan = mutation({
  args: { productId: v.id("products"), expiryDate: v.string() },
  handler: async (ctx, { productId, expiryDate }) => {
    await requireMemberId(ctx);
    if (!isDate(expiryDate)) throw new ConvexError("EXPIRY_DATE_INVALID");
    const product = await ctx.db.get(productId);
    if (product === null) throw new ConvexError("PRODUCT_NOT_FOUND");
    if (product.stock === 0) return;
    await ctx.db.patch(productId, applyRestock(product, 0, expiryDate));
  },
});

/**
 * Applies the scan mode to a Product `n` times: Add Restocks n with the
 * packages' date (ignored unless it is a calendar day) and never takes from
 * the Bag, since groceries reach Stock through Put Away; Need more raises the
 * Entry by n; Use Uses 1. Returns what the scan confirmation shows: the Product, how
 * its Stock changed and whether it crossed into Running Low, its Expiry Kind,
 * whether to ask for the package's date (an Add of a Product with an Expiry
 * Kind; `dateScan` takes the answer), and for Need more the Entry and its quantity (for undo).
 */
async function applyMode(
  ctx: MutationCtx,
  memberId: Id<"users">,
  product: Doc<"products">,
  mode: ScanMode,
  n = 1,
  expiryDate?: string,
) {
  const base = {
    unknown: false as const,
    productId: product._id,
    name: product.name,
    expiryKind: product.expiryKind ?? null,
    asksForDate: mode === "add" && product.expiryKind !== undefined,
  };
  switch (mode) {
    case "add":
      return {
        ...base,
        action: "restock" as const,
        ...(await changeStock(ctx, memberId, product, "restock", n, isDate(expiryDate ?? "") ? expiryDate : undefined)),
      };
    case "use":
      return { ...base, action: "use" as const, ...(await changeStock(ctx, memberId, product, "use")) };
    case "needMore": {
      const { entryId, quantity } = await needMoreOf(ctx, memberId, product, n);
      return {
        ...base,
        action: "needMore" as const,
        from: product.stock,
        to: product.stock,
        expiryDateBefore: product.expiryDate,
        crossedIntoRunningLow: false,
        entryId,
        quantity,
      };
    }
  }
}

async function linkCode(ctx: MutationCtx, code: string, productId: Id<"products">) {
  const existing = await findBarcode(ctx, code);
  if (existing?.productId === productId) return;
  if (existing !== null) throw new ConvexError("BARCODE_TAKEN");
  await ctx.db.insert("barcodes", { code, productId });
}

function findBarcode(ctx: MutationCtx, code: string) {
  return ctx.db
    .query("barcodes")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}
