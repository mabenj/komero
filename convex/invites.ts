import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireMemberId } from "./members";

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** Creates a one-time Invite valid for 7 days and returns its token. */
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const createdBy = await requireMemberId(ctx);
    const token = crypto.randomUUID();
    await ctx.db.insert("invites", { token, createdBy, expiresAt: Date.now() + INVITE_LIFETIME_MS });
    return token;
  },
});

/** Public: the Invite page checks its link before asking for an email and password. */
export const isUsable = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => (await findUsableInvite(ctx, token)) !== null,
});

/** Uses up the Invite for a new Member's sign-up, or rejects the sign-up. */
export async function redeemInvite(ctx: MutationCtx, token: string | undefined, memberId: Id<"users">) {
  const invite = token ? await findUsableInvite(ctx, token) : null;
  if (!invite) throw new ConvexError("INVITE_INVALID");
  await ctx.db.patch(invite._id, { usedAt: Date.now(), usedBy: memberId });
}

async function findUsableInvite(ctx: QueryCtx, token: string) {
  const invite = await ctx.db
    .query("invites")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!invite || invite.usedAt !== undefined || invite.expiresAt <= Date.now()) return null;
  return invite;
}
