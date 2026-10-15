import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** A Member's UI language. Finnish is the default. */
export const language = v.union(v.literal("fi"), v.literal("en"));

/**
 * What an Activity records. To record a new kind: add it here, add
 * `activity.<kind>` to lib/i18n/fi.ts and en.ts (typecheck fails until both
 * exist), and call `recordActivity` from the mutation that makes the change.
 */
export const activityKind = v.union(
  v.literal("create"),
  v.literal("rename"),
  v.literal("delete"),
  v.literal("restore"),
  v.literal("restock"),
  v.literal("use"),
  v.literal("undoStockChange"),
  v.literal("needMore"),
  v.literal("addOneOff"),
  v.literal("removeEntry"),
  v.literal("restoreEntry"),
  v.literal("tick"),
  v.literal("untick"),
  v.literal("putAway"),
);

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
  products: defineTable({
    name: v.string(),
    // The name normalised for case-insensitive matching (see productNames.ts).
    nameKey: v.string(),
    locationId: v.id("locations"),
    stock: v.number(),
  })
    .index("by_location", ["locationId", "nameKey"])
    .index("by_nameKey", ["nameKey"]),
  // Shopping List Entries: linked to a Product, or a One-off with its own name.
  // At most one `toBuy` Entry per Product; ticked Entries are `inBag`.
  entries: defineTable({
    productId: v.optional(v.id("products")),
    // The One-off's text; Product Entries show the Product's current name instead.
    name: v.optional(v.string()),
    quantity: v.number(),
    state: v.union(v.literal("toBuy"), v.literal("inBag")),
    createdBy: v.id("users"),
  })
    .index("by_state", ["state"])
    .index("by_product", ["productId", "state"]),
  // Who changed what. The time is `_creationTime`; rows older than 90 days are purged daily.
  activities: defineTable({
    memberId: v.id("users"),
    kind: activityKind,
    // Kept after the Product is deleted; `products.restore` re-links it to the restored Product.
    // Absent for One-offs.
    productId: v.optional(v.id("products")),
    // The Product's (or One-off's) name at the time, so the feed reads correctly after renames and deletes.
    productName: v.string(),
    // Stock before and after, for Stock changes.
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    // The previous name, for renames.
    fromName: v.optional(v.string()),
    // The Entry's quantity on the Shopping List, for list changes.
    quantity: v.optional(v.number()),
  }).index("by_product", ["productId"]),
});
