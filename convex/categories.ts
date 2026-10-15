import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { putInOrder, requiredName } from "./locations";
import { requireMemberId } from "./members";

// Category names are household text, not UI copy, so they are never translated.
// In the order a typical shop is walked through.
const DEFAULT_CATEGORIES = [
  "HeVi",
  "Leivät",
  "Maitotuotteet",
  "Liha ja kala",
  "Kuivatuotteet",
  "Pakasteet",
  "Juomat",
  "Kosmetiikka",
  "Siivous ja koti",
];

export async function seedDefaultCategories(ctx: MutationCtx) {
  if ((await ctx.db.query("categories").first()) !== null) return;
  for (const [sortOrder, name] of DEFAULT_CATEGORIES.entries()) {
    await ctx.db.insert("categories", { name, sortOrder });
  }
}

/**
 * Adds the default Categories to a deployment that has none. Run once by hand
 * after deploying Categories: `npx convex run categories:seedDefaults`.
 */
export const seedDefaults = internalMutation({
  args: {},
  handler: seedDefaultCategories,
});

/** The household's Categories in walking order. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireMemberId(ctx);
    const categories = await ctx.db.query("categories").withIndex("by_sortOrder").collect();
    return categories.map(({ _id, name }) => ({ _id, name }));
  },
});

/** Adds a Category after the existing ones. */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireMemberId(ctx);
    const last = await ctx.db.query("categories").withIndex("by_sortOrder").order("desc").first();
    return await ctx.db.insert("categories", { name: requiredName(name), sortOrder: (last?.sortOrder ?? -1) + 1 });
  },
});

export const rename = mutation({
  args: { categoryId: v.id("categories"), name: v.string() },
  handler: async (ctx, { categoryId, name }) => {
    await requireMemberId(ctx);
    await requireCategory(ctx, categoryId);
    await ctx.db.patch(categoryId, { name: requiredName(name) });
  },
});

/**
 * Puts the Categories in the walking order given. Categories missing from the
 * list (say, one just added on another phone) keep their order after the
 * listed ones, and listed ones that no longer exist are skipped.
 */
export const reorder = mutation({
  args: { categoryIds: v.array(v.id("categories")) },
  handler: async (ctx, { categoryIds }) => {
    await requireMemberId(ctx);
    await putInOrder(ctx, await ctx.db.query("categories").withIndex("by_sortOrder").collect(), categoryIds);
  },
});

/**
 * Deletes a Category straight away, even the last one. Its Products are left
 * without a Category, so Lista shows them under "Other".
 */
export const remove = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, { categoryId }) => {
    await requireMemberId(ctx);
    await requireCategory(ctx, categoryId);
    const products = await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
      .collect();
    for (const product of products) await ctx.db.patch(product._id, { categoryId: undefined });
    await ctx.db.delete(categoryId);
  },
});

export async function requireCategory(ctx: MutationCtx, categoryId: Id<"categories">) {
  if ((await ctx.db.get(categoryId)) === null) throw new ConvexError("CATEGORY_NOT_FOUND");
}
