import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { recordActivity } from "./activities";
import { requireCategory } from "./categories";
import { nameKey, tidyName } from "./productNames";
import type { ExpiryKind } from "./stock";

type NewProduct = {
  name: string;
  locationId: Id<"locations">;
  categoryId?: Id<"categories">;
  stock: number;
  minimumStock?: number;
  expiryKind?: ExpiryKind;
};

/**
 * Adds a Product and records it as an Activity. Names are not unique: a
 * duplicate is only warned about while typing (see `products.search`).
 */
export async function createProduct(
  ctx: MutationCtx,
  memberId: Id<"users">,
  { name, locationId, categoryId, stock, minimumStock, expiryKind }: NewProduct,
) {
  const tidy = tidyName(name);
  if (tidy === "") throw new ConvexError("NAME_REQUIRED");
  if ((await ctx.db.get(locationId)) === null) throw new ConvexError("LOCATION_NOT_FOUND");
  if (categoryId !== undefined) await requireCategory(ctx, categoryId);
  if (minimumStock !== undefined) requireMinimumStock(minimumStock);
  const productId = await ctx.db.insert("products", {
    name: tidy,
    nameKey: nameKey(tidy),
    locationId,
    categoryId,
    stock,
    minimumStock,
    expiryKind,
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
  const existing = await ctx.db
    .query("products")
    .withIndex("by_nameKey", (q) => q.eq("nameKey", nameKey(product.name)))
    .first();
  return existing ?? (await createProduct(ctx, memberId, product));
}

/** A Minimum Stock is a whole number of packages, 0 or more. */
export function requireMinimumStock(minimumStock: number) {
  if (!(Number.isInteger(minimumStock) && minimumStock >= 0)) throw new ConvexError("MINIMUM_STOCK_INVALID");
}
