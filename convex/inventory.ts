import { query } from "./_generated/server";
import { requireMemberId } from "./members";

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
