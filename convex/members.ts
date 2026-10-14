import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { language } from "./schema";

/** The signed-in Member's id. Every Member-only function starts with this. */
export async function requireMemberId(ctx: QueryCtx) {
  const memberId = await getAuthUserId(ctx);
  if (memberId === null) throw new ConvexError("NOT_SIGNED_IN");
  return memberId;
}

/** True until the first Member has signed up. Public: the sign-in screen needs it. */
export const isFirstRun = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("users").first()) === null,
});

/** Everyone with access to Komero, oldest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireMemberId(ctx);
    const members = await ctx.db.query("users").collect();
    return members.map((member) => ({ _id: member._id, email: member.email ?? "" }));
  },
});

/** The signed-in Member, or null when signed out. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const memberId = await getAuthUserId(ctx);
    const member = memberId && (await ctx.db.get(memberId));
    if (!member) return null;
    return { _id: member._id, email: member.email ?? "", language: member.language ?? "fi" };
  },
});

/** Sets the signed-in Member's UI language, which follows them to every device. */
export const setLanguage = mutation({
  args: { language },
  handler: async (ctx, args) => {
    const memberId = await requireMemberId(ctx);
    await ctx.db.patch(memberId, { language: args.language });
  },
});
