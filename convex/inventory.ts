import { query } from "./_generated/server";
import { requireMemberId } from "./members";
import { attentionStatus, byUrgency } from "./stock";

/** Koti: every Location in the household's order, each with its Products by name. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireMemberId(ctx);
    const locations = await ctx.db.query("locations").withIndex("by_sortOrder").collect();
    return Promise.all(
      locations.map(async (location) => {
        const products = await ctx.db
          .query("products")
          .withIndex("by_location", (q) => q.eq("locationId", location._id))
          .collect();
        return {
          _id: location._id,
          name: location.name,
          products: products.map(({ _id, name, stock }) => ({ _id, name, stock })),
        };
      }),
    );
  },
});

/**
 * The Needs Attention section at the top of Koti: every Product with an
 * attention status, most urgent first, then by name.
 */
export const needsAttention = query({
  args: {},
  handler: async (ctx) => {
    await requireMemberId(ctx);
    const products = await ctx.db.query("products").collect();
    const flagged = products.flatMap((product) => {
      const attention = attentionStatus(product);
      return attention === null ? [] : [{ product, attention }];
    });
    flagged.sort(
      (a, b) => byUrgency(a.attention, b.attention) || a.product.name.localeCompare(b.product.name, "fi"),
    );
    return Promise.all(
      flagged.map(async ({ product, attention }) => ({
        _id: product._id,
        name: product.name,
        stock: product.stock,
        locationName: (await ctx.db.get(product.locationId))?.name ?? "",
        attention,
      })),
    );
  },
});
