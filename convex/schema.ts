import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** A Member's UI language. Finnish is the default. */
export const language = v.union(v.literal("fi"), v.literal("en"));

export default defineSchema({
  ...authTables,
  // Members. Convex Auth requires the table to be called `users`; it is
  // overridden here to add Member fields, keeping the auth fields and indexes.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    language: v.optional(language),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  invites: defineTable({
    token: v.string(),
    createdBy: v.id("users"),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    usedBy: v.optional(v.id("users")),
  }).index("by_token", ["token"]),
  locations: defineTable({
    name: v.string(),
    sortOrder: v.number(),
  }).index("by_sortOrder", ["sortOrder"]),
});
