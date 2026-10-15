import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type MemberSession, newKomero, signUp } from "./test.helpers";

async function locationId(member: MemberSession, name: string) {
  const inventory = await member.query(api.inventory.get, {});
  return inventory.find((location) => location.name === name)!._id;
}

async function product(member: MemberSession, name: string, locationName: string) {
  return member.mutation(api.products.create, { name, locationId: await locationId(member, locationName) });
}

const use = (member: MemberSession, productId: Id<"products">) =>
  member.mutation(api.products.adjustStock, { productId, change: "use" });
const restock = (member: MemberSession, productId: Id<"products">) =>
  member.mutation(api.products.adjustStock, { productId, change: "restock" });

/** Needs Attention on Koti as text: "Name (Location, Stock n): status". */
async function needsAttention(member: MemberSession) {
  const products = await member.query(api.inventory.needsAttention, {});
  return products.map((p) => `${p.name} (${p.locationName}, Stock ${p.stock}): ${p.attention}`);
}

describe("Running Low", () => {
  test("without a Minimum Stock, Maito is Running Low only once it is Out of Stock", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");
    expect(await needsAttention(anna)).toEqual([]);

    await use(anna, maito);

    expect(await needsAttention(anna)).toEqual(["Maito (Jääkaappi, Stock 0): runningLow"]);

    await restock(anna, maito);

    expect(await needsAttention(anna)).toEqual([]);
  });

  test("with a Minimum Stock of 2, Vessapaperi is Running Low once Stock is down to 2", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const paperi = await product(anna, "Vessapaperi", "Kylpyhuone");
    await restock(anna, paperi);
    await restock(anna, paperi);
    await restock(anna, paperi);

    await anna.mutation(api.products.update, { productId: paperi, minimumStock: 2 });

    expect((await anna.query(api.products.get, { productId: paperi }))?.minimumStock).toBe(2);
    expect(await needsAttention(anna)).toEqual([]);

    await use(anna, paperi);
    expect(await needsAttention(anna)).toEqual([]);

    await use(anna, paperi);
    expect(await needsAttention(anna)).toEqual(["Vessapaperi (Kylpyhuone, Stock 2): runningLow"]);
  });

  test("clearing the Minimum Stock on the Product page brings back the Out of Stock rule", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const paperi = await product(anna, "Vessapaperi", "Kylpyhuone");
    await anna.mutation(api.products.update, { productId: paperi, minimumStock: 2 });
    expect(await needsAttention(anna)).toEqual(["Vessapaperi (Kylpyhuone, Stock 1): runningLow"]);

    await anna.mutation(api.products.update, { productId: paperi, minimumStock: null });

    expect((await anna.query(api.products.get, { productId: paperi }))?.minimumStock).toBeNull();
    expect(await needsAttention(anna)).toEqual([]);
  });

  test("only the – that takes Vessapaperi down to its Minimum Stock crosses into Running Low", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const paperi = await product(anna, "Vessapaperi", "Kylpyhuone");
    await restock(anna, paperi);
    await restock(anna, paperi);
    await anna.mutation(api.products.update, { productId: paperi, minimumStock: 1 });

    expect(await use(anna, paperi)).toEqual({ from: 3, to: 2, crossedIntoRunningLow: false });
    expect(await use(anna, paperi)).toEqual({ from: 2, to: 1, crossedIntoRunningLow: true });
    expect(await use(anna, paperi)).toEqual({ from: 1, to: 0, crossedIntoRunningLow: false });
    expect(await restock(anna, paperi)).toEqual({ from: 0, to: 1, crossedIntoRunningLow: false });
    expect(await restock(anna, paperi)).toEqual({ from: 1, to: 2, crossedIntoRunningLow: false });
    expect(await use(anna, paperi)).toEqual({ from: 2, to: 1, crossedIntoRunningLow: true });
  });

  test("without a Minimum Stock, the – that empties Maito crosses into Running Low; another – at 0 doesn't", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");

    expect(await use(anna, maito)).toEqual({ from: 1, to: 0, crossedIntoRunningLow: true });
    expect(await use(anna, maito)).toEqual({ from: 0, to: 0, crossedIntoRunningLow: false });
  });

  test("ignoring the Running Low toast puts nothing on the Shopping List", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");

    await use(anna, maito);

    expect(await anna.query(api.shoppingList.get, {})).toEqual({ locations: [], oneOffs: [] });
  });

  test("undoing a delete brings Vessapaperi back with its Minimum Stock", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const paperi = await product(anna, "Vessapaperi", "Kylpyhuone");
    await anna.mutation(api.products.update, { productId: paperi, minimumStock: 2 });

    const restored = await anna.mutation(api.products.restore, await anna.mutation(api.products.remove, { productId: paperi }));

    expect((await anna.query(api.products.get, { productId: restored }))?.minimumStock).toBe(2);
  });

  test("a Minimum Stock is a whole number of packages, 0 or more", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const paperi = await product(anna, "Vessapaperi", "Kylpyhuone");

    for (const minimumStock of [-1, 1.5]) {
      await expect(anna.mutation(api.products.update, { productId: paperi, minimumStock })).rejects.toThrow(
        /MINIMUM_STOCK_INVALID/,
      );
    }
  });
});

describe("Needs Attention", () => {
  test("Ben sees every Running Low Product from all Locations by name, and Need More puts one on the list", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const ben = await signUp(t, "ben@example.com", await anna.mutation(api.invites.create, {}));
    const maito = await product(anna, "Maito", "Jääkaappi");
    const tiskiaine = await product(anna, "Tiskiaine", "Siivouskomero");
    const mehu = await product(anna, "Appelsiinimehu", "Jääkaappi");
    await product(anna, "Kahvi", "Kaappi");
    await use(anna, tiskiaine);
    await use(anna, maito);
    await anna.mutation(api.products.update, { productId: mehu, minimumStock: 1 });

    expect(await needsAttention(ben)).toEqual([
      "Appelsiinimehu (Jääkaappi, Stock 1): runningLow",
      "Maito (Jääkaappi, Stock 0): runningLow",
      "Tiskiaine (Siivouskomero, Stock 0): runningLow",
    ]);

    const [, maitoInAttention] = await ben.query(api.inventory.needsAttention, {});
    await ben.mutation(api.shoppingList.needMore, { productId: maitoInAttention._id });

    const list = await anna.query(api.shoppingList.get, {});
    expect(list.locations.flatMap((l) => l.entries.map((e) => `${e.name} ×${e.quantity}`))).toEqual(["Maito ×1"]);
  });

  test("a visitor who isn't signed in can't see Needs Attention", async () => {
    const t = newKomero();
    await signUp(t, "anna@example.com");

    await expect(t.query(api.inventory.needsAttention, {})).rejects.toThrow(/NOT_SIGNED_IN/);
  });
});
