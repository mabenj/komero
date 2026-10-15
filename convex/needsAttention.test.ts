import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ExpiryKind } from "./stock";
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

/** The Member's date on their phone, which Koti passes to Needs Attention. */
const TODAY = "2026-10-15";

/** Needs Attention on Koti as text: "Name (Category, Stock n): status", as seen on `today`. */
async function needsAttention(member: MemberSession, today = TODAY) {
  const products = await member.query(api.inventory.needsAttention, { today });
  return products.map((p) => `${p.name} (${p.locationName}, Stock ${p.stock}): ${p.attention}`);
}

/** Gives a Product an Expiry Kind and Date from its page. */
const dated = (member: MemberSession, productId: Id<"products">, expiryKind: ExpiryKind, expiryDate: string) =>
  member.mutation(api.products.update, { productId, expiryKind, expiryDate });

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

  test("raising Vessapaperi's Minimum Stock up to its Stock crosses into Running Low; changing it while low doesn't", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const paperi = await product(anna, "Vessapaperi", "Kylpyhuone");
    await restock(anna, paperi);
    const setMinimum = (minimumStock: number | null) =>
      anna.mutation(api.products.update, { productId: paperi, minimumStock });

    expect(await setMinimum(1)).toEqual({ crossedIntoRunningLow: false });
    expect(await setMinimum(2)).toEqual({ crossedIntoRunningLow: true });
    expect(await setMinimum(3)).toEqual({ crossedIntoRunningLow: false });
    expect(await setMinimum(null)).toEqual({ crossedIntoRunningLow: false });
  });

  test("undoing the + that took Vessapaperi above its Minimum Stock crosses back into Running Low", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const paperi = await product(anna, "Vessapaperi", "Kylpyhuone");
    await anna.mutation(api.products.update, { productId: paperi, minimumStock: 1 });

    const { from, to } = await restock(anna, paperi);

    expect(await anna.mutation(api.products.undoStockChange, { productId: paperi, from, to })).toEqual({
      crossedIntoRunningLow: true,
    });
    expect(await needsAttention(anna)).toEqual(["Vessapaperi (Kylpyhuone, Stock 1): runningLow"]);
  });

  test("ignoring the Running Low toast puts nothing on the Shopping List", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");

    await use(anna, maito);

    expect(await anna.query(api.shoppingList.get, {})).toEqual({ locations: [], oneOffs: [], bag: [] });
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

describe("Expiry in Needs Attention", () => {
  test("Maito is Expired the day after its Use By date, not on the day itself", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");
    await restock(anna, maito);
    await dated(anna, maito, "useBy", "2026-10-15");

    expect(await needsAttention(anna, "2026-10-16")).toEqual(["Maito (Jääkaappi, Stock 2): expired"]);
  });

  test("Jugurtti past its Best Before date says Check it rather than Expired", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const jugurtti = await product(anna, "Jugurtti", "Jääkaappi");
    await restock(anna, jugurtti);
    await dated(anna, jugurtti, "bestBefore", "2026-10-15");

    expect(await needsAttention(anna, "2026-10-16")).toEqual(["Jugurtti (Jääkaappi, Stock 2): checkIt"]);
  });

  test("Maito is Expiring soon from 3 days before its date up to the day itself", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");
    await restock(anna, maito);
    await dated(anna, maito, "useBy", "2026-10-20");

    expect(await needsAttention(anna, "2026-10-16")).toEqual([]);
    for (const today of ["2026-10-17", "2026-10-19", "2026-10-20"]) {
      expect(await needsAttention(anna, today)).toEqual(["Maito (Jääkaappi, Stock 2): expiringSoon"]);
    }
    expect(await needsAttention(anna, "2026-10-21")).toEqual(["Maito (Jääkaappi, Stock 2): expired"]);
  });

  test("3 days counts across a month's end", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");
    await restock(anna, maito);
    await dated(anna, maito, "useBy", "2026-11-02");

    expect(await needsAttention(anna, "2026-10-29")).toEqual([]);
    expect(await needsAttention(anna, "2026-10-30")).toEqual(["Maito (Jääkaappi, Stock 2): expiringSoon"]);
  });

  test("Needs Attention puts Expired first, then Check it, then Expiring soon, then Running Low", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const tiskiaine = await product(anna, "Tiskiaine", "Siivouskomero");
    await use(anna, tiskiaine);
    const appelsiinimehu = await product(anna, "Appelsiinimehu", "Jääkaappi");
    await dated(anna, appelsiinimehu, "useBy", "2026-10-17");
    const jugurtti = await product(anna, "Jugurtti", "Jääkaappi");
    await dated(anna, jugurtti, "bestBefore", "2026-10-10");
    const maito = await product(anna, "Maito", "Jääkaappi");
    await dated(anna, maito, "useBy", "2026-10-14");
    const kerma = await product(anna, "Kerma", "Jääkaappi");
    await dated(anna, kerma, "useBy", "2026-12-01");
    const kinkku = await product(anna, "Kinkku", "Jääkaappi");
    await restock(anna, kinkku);
    await dated(anna, kinkku, "useBy", "2026-10-15");

    expect(await needsAttention(anna, "2026-10-15")).toEqual([
      "Maito (Jääkaappi, Stock 1): expired",
      "Jugurtti (Jääkaappi, Stock 1): checkIt",
      "Appelsiinimehu (Jääkaappi, Stock 1): expiringSoon",
      "Kinkku (Jääkaappi, Stock 2): expiringSoon",
      "Tiskiaine (Siivouskomero, Stock 0): runningLow",
    ]);
  });

  test("a Running Low Product that is also expiring shows only its more urgent status", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");
    await anna.mutation(api.products.update, { productId: maito, minimumStock: 1 });
    await dated(anna, maito, "useBy", "2026-10-16");

    expect(await needsAttention(anna, "2026-10-15")).toEqual(["Maito (Jääkaappi, Stock 1): expiringSoon"]);
  });

  test("a Product without an Expiry Kind never needs attention for a date", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");
    await restock(anna, maito);
    await dated(anna, maito, "useBy", "2026-10-15");

    await anna.mutation(api.products.update, { productId: maito, expiryKind: null });

    expect(await needsAttention(anna, "2026-10-30")).toEqual([]);
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

    const [, maitoInAttention] = await ben.query(api.inventory.needsAttention, { today: TODAY });
    await ben.mutation(api.shoppingList.needMore, { productId: maitoInAttention._id });

    const list = await anna.query(api.shoppingList.get, {});
    expect(list.locations.flatMap((l) => l.entries.map((e) => `${e.name} ×${e.quantity}`))).toEqual(["Maito ×1"]);
  });

  test("a visitor who isn't signed in can't see Needs Attention", async () => {
    const t = newKomero();
    await signUp(t, "anna@example.com");

    await expect(t.query(api.inventory.needsAttention, { today: TODAY })).rejects.toThrow(/NOT_SIGNED_IN/);
  });
});
