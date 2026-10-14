import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    language: v.optional(v.union(v.literal("fi"), v.literal("en"))),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  locations: defineTable({
    name: v.string(),
    sortOrder: v.number(),
  }).index("by_sortOrder", ["sortOrder"]),
  products: defineTable({
    name: v.string(),
    // The name normalised for case-insensitive matching (see productNames.ts).
    nameKey: v.string(),
    locationId: v.id("locations"),
    stock: v.number(),
  })
    .index("by_location", ["locationId", "nameKey"])
    .index("by_nameKey", ["nameKey"]),
});
