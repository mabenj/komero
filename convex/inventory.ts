import { query } from "./_generated/server";
import { requireMemberId } from "./members";

/** Koti: every Location in the household's order, each with its Products. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireMemberId(ctx);
    const locations = await ctx.db.query("locations").withIndex("by_sortOrder").collect();
    return locations.map((location) => ({
      _id: location._id,
      name: location.name,
      products: [] as never[], // Products arrive in a later ticket.
    }));
  },
});
