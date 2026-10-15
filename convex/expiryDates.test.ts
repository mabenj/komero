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

/** The Product page's Expiry Kind and Expiry Date. */
async function expiry(member: MemberSession, productId: Id<"products">) {
  const page = await member.query(api.products.get, { productId });
  return { kind: page?.expiryKind, date: page?.expiryDate, stock: page?.stock };
}

describe("Expiry Kind and Expiry Date on the Product page", () => {
  test("a new Product has no Expiry Kind and no Expiry Date", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");

    expect(await expiry(anna, maito)).toEqual({ kind: null, date: null, stock: 1 });
  });

  test("Anna sets Maito to Use By with a date, then fixes the date", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");

    await anna.mutation(api.products.update, { productId: maito, expiryKind: "useBy", expiryDate: "2026-10-20" });
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-20", stock: 1 });

    await anna.mutation(api.products.update, { productId: maito, expiryDate: "2026-10-22" });
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-22", stock: 1 });

    await anna.mutation(api.products.update, { productId: maito, expiryDate: null });
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: null, stock: 1 });
  });

  test("setting the Expiry Kind back to none clears the Expiry Date", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");
    await anna.mutation(api.products.update, { productId: maito, expiryKind: "bestBefore", expiryDate: "2026-10-20" });

    await anna.mutation(api.products.update, { productId: maito, expiryKind: null });

    expect(await expiry(anna, maito)).toEqual({ kind: null, date: null, stock: 1 });
  });

  test("undoing a delete brings Maito back with its Expiry Kind and Date", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");
    await anna.mutation(api.products.update, { productId: maito, expiryKind: "useBy", expiryDate: "2026-10-20" });

    const restored = await anna.mutation(
      api.products.restore,
      await anna.mutation(api.products.remove, { productId: maito }),
    );

    expect(await expiry(anna, restored)).toEqual({ kind: "useBy", date: "2026-10-20", stock: 1 });
  });

  test("a Product without an Expiry Kind can't get a date, and a date must be a real day", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const paperi = await product(anna, "Vessapaperi", "Kylpyhuone");

    await expect(
      anna.mutation(api.products.update, { productId: paperi, expiryDate: "2026-10-20" }),
    ).rejects.toThrow(/EXPIRY_KIND_REQUIRED/);
    for (const expiryDate of ["20.10.2026", "2026-02-30", ""]) {
      await expect(
        anna.mutation(api.products.update, { productId: paperi, expiryKind: "bestBefore", expiryDate }),
      ).rejects.toThrow(/EXPIRY_DATE_INVALID/);
    }
  });
});

const use = (member: MemberSession, productId: Id<"products">) =>
  member.mutation(api.products.adjustStock, { productId, change: "use" });
const restock = (member: MemberSession, productId: Id<"products">) =>
  member.mutation(api.products.adjustStock, { productId, change: "restock" });

/** Need More, tick it into the Bag and Put Away, with the date typed into the prompt (or Skip). */
async function buyAndPutAway(member: MemberSession, productId: Id<"products">, expiryDate?: string) {
  const { entryId } = await member.mutation(api.shoppingList.needMore, { productId });
  await member.mutation(api.shoppingList.tick, { entryId });
  await member.mutation(api.shoppingList.putAway, { entryId, ...(expiryDate && { expiryDate }) });
}

async function maitoUseBy(member: MemberSession, expiryDate?: string) {
  const maito = await product(member, "Maito", "Jääkaappi");
  await member.mutation(api.products.update, { productId: maito, expiryKind: "useBy", expiryDate });
  return maito;
}

describe("Date badges on Koti", () => {
  test("Koti rows carry the Expiry Kind and Date of dated Products only", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await maitoUseBy(anna, "2026-10-20");
    const jugurtti = await product(anna, "Jugurtti", "Jääkaappi");
    await anna.mutation(api.products.update, { productId: jugurtti, expiryKind: "bestBefore" });
    await product(anna, "Kerma", "Jääkaappi");

    const jaakaappi = (await anna.query(api.inventory.get, {})).find((l) => l.name === "Jääkaappi")!;

    expect(jaakaappi.products.map(({ name, expiryKind, expiryDate }) => ({ name, expiryKind, expiryDate }))).toEqual([
      { name: "Jugurtti", expiryKind: "bestBefore", expiryDate: null },
      { name: "Kerma", expiryKind: null, expiryDate: null },
      { name: "Maito", expiryKind: "useBy", expiryDate: "2026-10-20" },
    ]);
  });
});

describe("Expiry Date rules", () => {
  test("Restocking Maito from 0 sets its Expiry Date to the new package's date", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoUseBy(anna);
    await use(anna, maito);

    await buyAndPutAway(anna, maito, "2026-10-20");

    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-20", stock: 1 });
  });

  test("Restocking Maito while some is at home keeps the earlier date; an undated Restock keeps the date", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoUseBy(anna, "2026-10-20");

    await buyAndPutAway(anna, maito, "2026-10-25");
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-20", stock: 2 });

    await buyAndPutAway(anna, maito, "2026-10-18");
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-18", stock: 3 });

    await buyAndPutAway(anna, maito);
    await restock(anna, maito);
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-18", stock: 5 });
  });

  test("Use leaves Maito's Expiry Date unchanged while some is left, and the last Use clears it", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoUseBy(anna, "2026-10-20");
    await restock(anna, maito);

    await use(anna, maito);
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-20", stock: 1 });

    await use(anna, maito);
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: null, stock: 0 });

    await restock(anna, maito);
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: null, stock: 1 });
  });

  test("Put away all takes a date per Product, and Products the prompt skipped keep theirs", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoUseBy(anna, "2026-10-20");
    const jugurtti = await product(anna, "Jugurtti", "Jääkaappi");
    await anna.mutation(api.products.update, { productId: jugurtti, expiryKind: "bestBefore" });
    await use(anna, jugurtti);
    const paperi = await product(anna, "Vessapaperi", "Kylpyhuone");
    for (const productId of [maito, jugurtti, paperi]) {
      const { entryId } = await anna.mutation(api.shoppingList.needMore, { productId });
      await anna.mutation(api.shoppingList.tick, { entryId });
    }

    await anna.mutation(api.shoppingList.putAwayAll, {
      expiryDates: { [jugurtti]: "2026-11-01", [paperi]: "2026-11-01" },
    });

    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-20", stock: 2 });
    expect(await expiry(anna, jugurtti)).toEqual({ kind: "bestBefore", date: "2026-11-01", stock: 1 });
    expect(await expiry(anna, paperi)).toEqual({ kind: null, date: null, stock: 2 });
  });

  test("the Bag tells which Products ask for a date when put away", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoUseBy(anna);
    const paperi = await product(anna, "Vessapaperi", "Kylpyhuone");
    for (const productId of [maito, paperi]) {
      const { entryId } = await anna.mutation(api.shoppingList.needMore, { productId });
      await anna.mutation(api.shoppingList.tick, { entryId });
    }
    await anna.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });
    await anna.mutation(api.shoppingList.tick, {
      entryId: (await anna.query(api.shoppingList.get, {})).other[0]._id,
    });

    const { bag } = await anna.query(api.shoppingList.get, {});

    expect(bag.other.map((entry) => `${entry.name}: ${"asksForDate" in entry && entry.asksForDate}`)).toEqual([
      "Maito: true",
      "Synttärikynttilät: false",
      "Vessapaperi: false",
    ]);
  });

  test("a date typed into the Put Away prompt must be a real day", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoUseBy(anna);

    await expect(buyAndPutAway(anna, maito, "2026-13-01")).rejects.toThrow(/EXPIRY_DATE_INVALID/);
    await expect(
      anna.mutation(api.shoppingList.putAwayAll, { expiryDates: { [maito]: "huomenna" } }),
    ).rejects.toThrow(/EXPIRY_DATE_INVALID/);
  });

  test("undoing a + or – on Maito keeps its Expiry Date while some is left", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoUseBy(anna, "2026-10-20");
    await restock(anna, maito);

    for (const adjust of [restock, use]) {
      const { from, to, expiryDateBefore } = await adjust(anna, maito);
      await anna.mutation(api.products.undoStockChange, { productId: maito, from, to, expiryDateBefore });
      expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-20", stock: 2 });
    }
  });

  test("undoing the – that used the last Maito brings its Expiry Date back", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoUseBy(anna, "2026-10-20");

    const { from, to, expiryDateBefore } = await use(anna, maito);
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: null, stock: 0 });

    await anna.mutation(api.products.undoStockChange, { productId: maito, from, to, expiryDateBefore });
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-20", stock: 1 });
  });

  test("undoing an Add scan whose package had an earlier date brings back the date from before", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoUseBy(anna, "2026-10-20");
    await anna.mutation(api.barcodes.link, { code: "6408430000012", productId: maito });

    const scanned = await anna.mutation(api.barcodes.scan, { code: "6408430000012", mode: "add" });
    if (scanned.unknown) throw new Error("Maito's barcode should be known");
    await anna.mutation(api.barcodes.dateScan, { productId: maito, expiryDate: "2026-10-17" });
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-17", stock: 2 });

    await anna.mutation(api.products.undoStockChange, {
      productId: maito,
      from: scanned.from,
      to: scanned.to,
      expiryDateBefore: scanned.expiryDateBefore,
    });
    expect(await expiry(anna, maito)).toEqual({ kind: "useBy", date: "2026-10-20", stock: 1 });
  });
});
