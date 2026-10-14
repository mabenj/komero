import type { MutationCtx } from "./_generated/server";

// Location names are household text, not UI copy, so they are never translated.
const DEFAULT_LOCATIONS = ["Jääkaappi", "Pakastin", "Kaappi", "Kylpyhuone", "Siivouskomero"];

export async function seedDefaultLocations(ctx: MutationCtx) {
  if ((await ctx.db.query("locations").first()) !== null) return;
  for (const [sortOrder, name] of DEFAULT_LOCATIONS.entries()) {
    await ctx.db.insert("locations", { name, sortOrder });
  }
}
