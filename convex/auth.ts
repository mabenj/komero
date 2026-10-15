import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { redeemInvite } from "./invites";
import type { MutationCtx } from "./_generated/server";
import { seedDefaultCategories } from "./categories";
import { seedDefaultLocations } from "./locations";

const DAY = 24 * 60 * 60 * 1000;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // Synchronous, runs for every flow. The result reaches createOrUpdateUser as `args.profile`.
      profile(params) {
        return {
          email: String(params.email).trim().toLowerCase(),
          ...(typeof params.inviteToken === "string" && { inviteToken: params.inviteToken }),
        };
      },
    }),
  ],
  // Members stay signed in for months (the proxy's cookie maxAge matches).
  session: { totalDurationMs: 365 * DAY, inactiveDurationMs: 180 * DAY },
  callbacks: {
    // Runs only when a new account is created, inside the same transaction as the
    // account insert, so throwing here rejects the sign-up without leaving anything behind.
    async createOrUpdateUser(genericCtx, args) {
      if (args.existingUserId) return args.existingUserId;
      const ctx = genericCtx as unknown as MutationCtx;
      const { email, inviteToken } = args.profile as { email: string; inviteToken?: string };

      const isFirstMember = (await ctx.db.query("users").first()) === null;
      const memberId = await ctx.db.insert("users", { email, language: "fi" });
      if (isFirstMember) {
        await seedDefaultLocations(ctx);
        await seedDefaultCategories(ctx);
      } else await redeemInvite(ctx, inviteToken, memberId);
      return memberId;
    },
  },
});
