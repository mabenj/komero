import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { recordActivity } from "./activities";
import { requireCategory } from "./categories";
import { nameKey, tidyName } from "./productNames";
import { type ExpiryKind, isDate } from "./stock";

type NewProduct = {
  name: string;
  locationId: Id<"locations">;
  categoryId?: Id<"categories">;
  stock: number;
  minimumStock?: number;
  expiryKind?: ExpiryKind;
  expiryDate?: string;
};

/**
 * Adds a Product and records it as an Activity. Names are not unique: a
 * duplicate is only warned about while typing (see `products.search`). An Out
 * of Stock Product has no Expiry Date, so one given with Stock 0 is dropped.
 */
export async function createProduct(
  ctx: MutationCtx,
  memberId: Id<"users">,
  { name, locationId, categoryId, stock, minimumStock, expiryKind, expiryDate }: NewProduct,
) {
  const tidy = tidyName(name);
  if (tidy === "") throw new ConvexError("NAME_REQUIRED");
  if ((await ctx.db.get(locationId)) === null) throw new ConvexError("LOCATION_NOT_FOUND");
  if (categoryId !== undefined) await requireCategory(ctx, categoryId);
  if (!(Number.isInteger(stock) && stock >= 0)) throw new ConvexError("STOCK_INVALID");
  if (minimumStock !== undefined) requireMinimumStock(minimumStock);
  if (expiryDate !== undefined) {
    if (!isDate(expiryDate)) throw new ConvexError("EXPIRY_DATE_INVALID");
    if (!expiryKind) throw new ConvexError("EXPIRY_KIND_REQUIRED");
  }
  const productId = await ctx.db.insert("products", {
    name: tidy,
    nameKey: nameKey(tidy),
    locationId,
    categoryId,
    stock,
    minimumStock,
    expiryKind,
    expiryDate: stock > 0 ? expiryDate : undefined,
  });
  const product = (await ctx.db.get(productId))!;
  await recordActivity(ctx, memberId, "create", product, { to: stock });
  return product;
}

/**
 * The Product already called `name` (in any case), left as it is, or else a
 * new one. Naming a Product while linking a Barcode or a One-off links to an
 * existing one rather than making a second.
 */
export async function findOrCreateProduct(ctx: MutationCtx, memberId: Id<"users">, product: NewProduct) {
  return (await findProductNamed(ctx, product.name)) ?? (await createProduct(ctx, memberId, product));
}

/** The Product already called `name` (in any case), or null. */
export function findProductNamed(ctx: QueryCtx, name: string) {
  return ctx.db
    .query("products")
    .withIndex("by_nameKey", (q) => q.eq("nameKey", nameKey(name)))
    .first();
}

/** A Minimum Stock is a whole number of packages, 0 or more. */
export function requireMinimumStock(minimumStock: number) {
  if (!(Number.isInteger(minimumStock) && minimumStock >= 0)) throw new ConvexError("MINIMUM_STOCK_INVALID");
}
