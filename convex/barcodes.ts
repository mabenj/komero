import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, action, mutation } from "./_generated/server";
import { requireMemberId } from "./members";
import { type ScanMode, scanMode } from "./scanModes";
import { findOrCreateProduct } from "./newProduct";
import { changeStock } from "./products";
import { needMoreOf, putAwayOneFromBag } from "./shoppingList";
import { applyRestock, type ExpiryKind, expiryKind, isDate } from "./stock";


/**
 * Codes are matched as strings. A UPC-A read as 12 digits is stored as its
 * 13-digit EAN form (leading 0), which is how the scanner usually reports it.
 */
function normalizeBarcode(code: string) {
  const trimmed = code.trim();
  return /^\d{12}$/.test(trimmed) ? `0${trimmed}` : trimmed;
}

/**
 * One scan in the chosen mode. A barcode no Product has comes back unknown,
 * for the New / Existing Product choice; `link` or `linkNew` then applies the mode.
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
 * "This is an existing Product" for an unknown barcode: links it, then applies
 * the scan mode. Without a mode it only links (the Barcode remove undo toast).
 */
export const link = mutation({
  args: { code: v.string(), productId: v.id("products"), mode: v.optional(scanMode) },
  handler: async (ctx, { code, productId, mode }) => {
    const memberId = await requireMemberId(ctx);
    const product = await ctx.db.get(productId);
    if (product === null) throw new ConvexError("PRODUCT_NOT_FOUND");
    await linkCode(ctx, normalizeBarcode(code), productId);
    return mode === undefined ? null : await applyMode(ctx, memberId, product, mode);
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
 * "New Product" for an unknown barcode: creates the Product Out of Stock in
 * the chosen Location (and Category, if one is chosen), links the barcode and
 * applies the scan mode, so Add mode leaves it at Stock 1. Its Expiry Kind is
 * the one Open Food Facts suggested, if any. A name that is already a
 * Product's (in any case) links to that Product instead, leaving it as it is.
 */
export const linkNew = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    locationId: v.id("locations"),
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
    mode: scanMode,
    expiryKind: v.optional(v.union(expiryKind, v.null())),
  },
  handler: async (ctx, { code, name, locationId, categoryId, mode, expiryKind }) => {
    const memberId = await requireMemberId(ctx);
    const product = await findOrCreateProduct(ctx, memberId, {
      name,
      locationId,
      categoryId: categoryId ?? undefined,
      stock: 0,
      expiryKind: expiryKind ?? undefined,
    });
    await linkCode(ctx, normalizeBarcode(code), product._id);
    return await applyMode(ctx, memberId, product, mode);
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
 * Applies the scan mode to a Product. Add Puts Away one package from the Bag
 * if the Bag has the Product, and otherwise Restocks 1; Use Uses 1; Need more
 * does Need More. Returns what the scan confirmation shows: the Product, how
 * its Stock changed and whether it crossed into Running Low, its Expiry Kind,
 * whether to ask for the package's date (an Add of a Product with an Expiry
 * Kind; `dateScan` takes the answer), and for Need more the Entry and its quantity (for undo).
 */
async function applyMode(ctx: MutationCtx, memberId: Id<"users">, product: Doc<"products">, mode: ScanMode) {
  const base = {
    unknown: false as const,
    productId: product._id,
    name: product.name,
    expiryKind: product.expiryKind ?? null,
    asksForDate: mode === "add" && product.expiryKind !== undefined,
  };
  const unchanged = {
    from: product.stock,
    to: product.stock,
    expiryDateBefore: product.expiryDate,
    crossedIntoRunningLow: false,
  };
  switch (mode) {
    case "add": {
      const fromBag = await putAwayOneFromBag(ctx, memberId, product);
      if (fromBag) return { ...base, action: "putAway" as const, ...unchanged, ...fromBag };
      return { ...base, action: "restock" as const, ...(await changeStock(ctx, memberId, product, "restock")) };
    }
    case "use":
      return { ...base, action: "use" as const, ...(await changeStock(ctx, memberId, product, "use")) };
    case "needMore": {
      const { entryId, quantity } = await needMoreOf(ctx, memberId, product);
      return { ...base, action: "needMore" as const, ...unchanged, entryId, quantity };
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
