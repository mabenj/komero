import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type MemberSession, newKomero, signUp } from "./test.helpers";

afterEach(() => {
  vi.useRealTimers();
});

async function product(member: MemberSession, name: string, stock = 0) {
  const locationId = (await member.query(api.inventory.get, {})).find((l) => l.name === "Jääkaappi")!._id;
  return await member.mutation(api.products.create, { name, locationId, stock });
}

/** Frequently Bought as "Name: days", most days first. */
async function frequentlyBought(member: MemberSession, names: Map<Id<"products">, string>) {
  const days = await member.query(api.frequentlyBought.get, {});
  return days.sort((a, b) => b.days - a.days).map(({ productId, days }) => `${names.get(productId)}: ${days}`);
}

function on(day: string) {
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
}

describe("Frequently Bought", () => {
  test("counts the days a Product was restocked, once per day however it was restocked", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    on("2026-10-01");
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", 2);
    const kahvi = await product(anna, "Kahvi");
    const names = new Map([
      [maito, "Maito"],
      [kahvi, "Kahvi"],
    ]);

    // Day 1: Maito +1 twice by hand, and put away from the Bag.
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    const [entry] = (await anna.query(api.shoppingList.get, {})).other;
    await anna.mutation(api.shoppingList.tick, { entryId: entry._id });
    await anna.mutation(api.shoppingList.putAwayAll, {});
    // Day 2: Maito and Kahvi.
    on("2026-10-02");
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });
    await anna.mutation(api.products.adjustStock, { productId: kahvi, change: "restock" });

    expect(await frequentlyBought(anna, names)).toEqual(["Maito: 2", "Kahvi: 1"]);
  });

  test("leaves out the Stock a Product is created with, Uses, and Products never restocked", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", 3);
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });

    expect(await anna.query(api.frequentlyBought.get, {})).toEqual([]);
  });

  test("an undone Restock doesn't count, and an undone Use doesn't take one away", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    on("2026-10-01");
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", 1);
    const names = new Map([[maito, "Maito"]]);
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });

    on("2026-10-02");
    const restocked = await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });
    await anna.mutation(api.products.undoStockChange, { productId: maito, from: restocked.from, to: restocked.to });
    const used = await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });
    await anna.mutation(api.products.undoStockChange, { productId: maito, from: used.from, to: used.to });

    expect(await frequentlyBought(anna, names)).toEqual(["Maito: 1"]);
  });
});
