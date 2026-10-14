import { type Infer, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, internalMutation, query } from "./_generated/server";
import { requireMemberId } from "./members";
import type { activityKind } from "./schema";

export type ActivityKind = Infer<typeof activityKind>;

/** Details some kinds carry: the Stock change, or the name before a rename. */
type ActivityDetails = { from?: number; to?: number; fromName?: string };

/**
 * Records that `memberId` did `kind` to a Product. Call it from the mutation
 * that makes the change, so the Activity is written in the same transaction.
 */
export async function recordActivity(
  ctx: MutationCtx,
  memberId: Id<"users">,
  kind: ActivityKind,
  product: { _id: Id<"products">; name: string },
  details: ActivityDetails = {},
) {
  await ctx.db.insert("activities", { memberId, kind, productId: product._id, productName: product.name, ...details });
}

const FEED_LENGTH = 100;

/** The household Activity feed in ⚙, newest first. */
export const feed = query({
  args: {},
  handler: async (ctx) => {
    await requireMemberId(ctx);
    const activities = await ctx.db.query("activities").order("desc").take(FEED_LENGTH);
    return withMemberNames(ctx, activities);
  },
});

const PRODUCT_PAGE_LENGTH = 20;

/** A Product's recent Activities for its page, newest first. */
export const forProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    await requireMemberId(ctx);
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_product", (q) => q.eq("productId", productId))
      .order("desc")
      .take(PRODUCT_PAGE_LENGTH);
    return withMemberNames(ctx, activities);
  },
});

/**
 * The delete undo toast brings a Product back under a new id; this moves the
 * deleted Product's Activities over so its page keeps its history.
 */
export async function relinkActivities(ctx: MutationCtx, from: Id<"products">, to: Id<"products">) {
  const activities = await ctx.db
    .query("activities")
    .withIndex("by_product", (q) => q.eq("productId", from))
    .collect();
  for (const activity of activities) await ctx.db.patch(activity._id, { productId: to });
}

const KEEP_FOR_MS = 90 * 24 * 60 * 60 * 1000;
// A household records far fewer Activities a day than this, so a backlog clears within a run or two.
const PURGE_BATCH = 1000;

/** Removes Activities older than 90 days. Runs daily (see crons.ts). */
export const purgeOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - KEEP_FOR_MS;
    const old = await ctx.db
      .query("activities")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(PURGE_BATCH);
    for (const activity of old) await ctx.db.delete(activity._id);
  },
});

/** Shapes Activities for the UI, naming the Member who did each one. */
async function withMemberNames(ctx: QueryCtx, activities: Doc<"activities">[]) {
  const names = new Map<Id<"users">, string>();
  for (const { memberId } of activities) {
    if (!names.has(memberId)) names.set(memberId, memberName(await ctx.db.get(memberId)));
  }
  return activities.map(({ _id, _creationTime, memberId, ...rest }) => ({
    _id,
    at: _creationTime,
    memberName: names.get(memberId)!,
    ...rest,
  }));
}

/** How the feed names a Member: the start of their email ("anna" for anna@example.com). */
function memberName(member: Doc<"users"> | null) {
  return member?.name ?? member?.email?.split("@")[0] ?? "?";
}
