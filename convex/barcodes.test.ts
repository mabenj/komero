import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { type MemberSession, newKomero, signUp } from "./test.helpers";

const MAITO_VALIO = "6408430000012";
const MAITO_ARLA = "5701234567892";

/** A household of two Members: Anna signs up first and invites Ben. */
async function annaAndBen() {
  const t = newKomero();
  const anna = await signUp(t, "anna@example.com");
  const ben = await signUp(t, "ben@example.com", await anna.mutation(api.invites.create, {}));
  return [anna, ben] as const;
}

async function locationId(member: MemberSession, name: string) {
  const inventory = await member.query(api.inventory.get, {});
  return inventory.find((location) => location.name === name)!._id;
}

async function stockOf(member: MemberSession, name: string) {
  const inventory = await member.query(api.inventory.get, {});
  return inventory.flatMap((location) => location.products).find((product) => product.name === name)?.stock;
}

describe("Scanning an unknown barcode", () => {
  test("a barcode no Product has yet comes back unknown, and nothing changes", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    const result = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });

    expect(result).toEqual({ unknown: true, code: MAITO_VALIO });
    expect(await stockOf(anna, "Maito")).toBeUndefined();
  });

  test("New Product in Add mode creates it in the chosen Location with Stock 1, and the next scan Restocks it", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    const linked = await anna.mutation(api.barcodes.linkNew, {
      code: MAITO_VALIO,
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
      mode: "add",
    });
    expect(linked).toMatchObject({ unknown: false, name: "Maito", action: "restock", from: 0, to: 1 });
    const page = await anna.query(api.products.get, { productId: linked!.productId });
    expect(page).toMatchObject({ name: "Maito", locationName: "Jääkaappi", stock: 1 });
    expect(page!.barcodes.map((barcode) => barcode.code)).toEqual([MAITO_VALIO]);

    const scanned = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });

    expect(scanned).toMatchObject({ unknown: false, name: "Maito", action: "restock", from: 1, to: 2 });
    expect(await stockOf(anna, "Maito")).toBe(2);
  });

  test("New Product in Need more mode: the empty package's Product is Out of Stock and on the list", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    const linked = await anna.mutation(api.barcodes.linkNew, {
      code: MAITO_VALIO,
      name: "Tiskiaine",
      locationId: await locationId(anna, "Siivouskomero"),
      mode: "needMore",
    });

    expect(linked).toMatchObject({ action: "needMore", name: "Tiskiaine", to: 0, quantity: 1 });
    const list = await anna.query(api.shoppingList.get, {});
    expect(list.locations.map((location) => [location.name, location.entries.map((e) => e.name)])).toEqual([
      ["Siivouskomero", ["Tiskiaine"]],
    ]);
    expect(await stockOf(anna, "Tiskiaine")).toBe(0);
  });

  test("typing the name of an existing Product, in any case, links the barcode to it instead of adding another", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    const linked = await anna.mutation(api.barcodes.linkNew, {
      code: MAITO_VALIO,
      name: "maito",
      locationId: await locationId(anna, "Kaappi"),
      mode: "add",
    });

    expect(linked).toMatchObject({ productId: maito, from: 1, to: 2 });
    const inventory = await anna.query(api.inventory.get, {});
    expect(inventory.flatMap((location) => location.products).map((product) => product.name)).toEqual(["Maito"]);
  });

  test("a visitor who isn't signed in can't scan", async () => {
    await expect(newKomero().mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).rejects.toThrow(
      /NOT_SIGNED_IN/,
    );
  });
});

/** Maito in Jääkaappi with Stock 1, linked to MAITO_VALIO by scanning it in Add mode. */
async function maitoWithBarcode(member: MemberSession) {
  const linked = await member.mutation(api.barcodes.linkNew, {
    code: MAITO_VALIO,
    name: "Maito",
    locationId: await locationId(member, "Jääkaappi"),
    mode: "add",
  });
  return linked.productId;
}

async function bag(member: MemberSession) {
  const list = await member.query(api.shoppingList.get, {});
  return list.bag.map((entry) => `${entry.name} ×${entry.quantity}`);
}

describe("Add mode", () => {
  test("a scan Puts Away one package from the Bag first, and only Restocks once the Bag has none", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    const [entry] = (await anna.query(api.shoppingList.get, {})).locations[0].entries;
    await anna.mutation(api.shoppingList.tick, { entryId: entry._id });
    expect(await bag(anna)).toEqual(["Maito ×2"]);

    const first = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });
    expect(first).toMatchObject({ action: "putAway", from: 1, to: 2 });
    expect(await bag(anna)).toEqual(["Maito ×1"]);

    const second = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });
    expect(second).toMatchObject({ action: "putAway", from: 2, to: 3 });
    expect(await bag(anna)).toEqual([]);

    const third = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });
    expect(third).toMatchObject({ action: "restock", from: 3, to: 4 });
    expect(await stockOf(anna, "Maito")).toBe(4);

    const activities = await anna.query(api.activities.forProduct, { productId: maito });
    expect(activities.slice(0, 3).map(({ kind, from, to, quantity }) => ({ kind, from, to, quantity }))).toEqual([
      { kind: "restock", from: 3, to: 4, quantity: undefined },
      { kind: "putAway", from: 2, to: 3, quantity: 1 },
      { kind: "putAway", from: 1, to: 2, quantity: 1 },
    ]);
  });
});

describe("Use mode", () => {
  test("a scan Uses 1; the one that empties Maito crosses into Running Low, and Stock stays at 0 after that", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await maitoWithBarcode(anna);
    await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });

    const first = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "use" });
    const second = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "use" });
    const third = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "use" });

    expect(first).toMatchObject({ action: "use", from: 2, to: 1, crossedIntoRunningLow: false });
    expect(second).toMatchObject({ action: "use", from: 1, to: 0, crossedIntoRunningLow: true });
    expect(third).toMatchObject({ action: "use", from: 0, to: 0, crossedIntoRunningLow: false });
    expect(await stockOf(anna, "Maito")).toBe(0);
  });
});

describe("Need more mode", () => {
  test("scanning an empty package puts Maito on the list, and scanning another raises its quantity; Stock is unchanged", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await maitoWithBarcode(anna);

    const first = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "needMore" });
    const second = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "needMore" });

    expect(first).toMatchObject({ action: "needMore", from: 1, to: 1, quantity: 1 });
    expect(second).toMatchObject({ action: "needMore", from: 1, to: 1, quantity: 2 });
    const list = await anna.query(api.shoppingList.get, {});
    const [entry] = list.locations[0].entries;
    expect([list.locations[0].name, entry.name, entry.quantity]).toEqual(["Jääkaappi", "Maito", 2]);
    expect(first).toMatchObject({ entryId: entry._id });
    expect(await stockOf(anna, "Maito")).toBe(1);
  });
});

describe("Linking Barcodes", () => {
  test("Arla's milk linked to the existing Maito in Use mode Uses Maito, and both brands then scan as Maito", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_ARLA, mode: "use" })).toMatchObject({ unknown: true });

    const linked = await anna.mutation(api.barcodes.link, { code: MAITO_ARLA, productId: maito, mode: "use" });

    expect(linked).toMatchObject({ productId: maito, name: "Maito", action: "use", from: 2, to: 1 });
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_ARLA, mode: "use" })).toMatchObject({
      name: "Maito",
      to: 0,
    });
    const page = await anna.query(api.products.get, { productId: maito });
    expect(page!.barcodes.map((barcode) => barcode.code).sort()).toEqual([MAITO_ARLA, MAITO_VALIO].sort());
  });

  test("a Barcode already on Maito can't also be linked to Kerma, and Maito keeps it", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await maitoWithBarcode(anna);
    const kerma = await ben.mutation(api.products.create, {
      name: "Kerma",
      locationId: await locationId(ben, "Jääkaappi"),
    });

    await expect(
      ben.mutation(api.barcodes.link, { code: MAITO_VALIO, productId: kerma, mode: "add" }),
    ).rejects.toThrow(/BARCODE_TAKEN/);
    await expect(
      ben.mutation(api.barcodes.linkNew, {
        code: MAITO_VALIO,
        name: "Piimä",
        locationId: await locationId(ben, "Jääkaappi"),
        mode: "add",
      }),
    ).rejects.toThrow(/BARCODE_TAKEN/);

    expect(await ben.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).toMatchObject({
      productId: maito,
    });
    expect((await ben.query(api.products.get, { productId: kerma }))!.barcodes).toEqual([]);
    expect(await stockOf(ben, "Piimä")).toBeUndefined();
  });

  test("removing a wrong Barcode from Maito's page makes it unknown again, and undo puts it back without changing Stock", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    const [barcode] = (await anna.query(api.products.get, { productId: maito }))!.barcodes;

    const removed = await anna.mutation(api.barcodes.remove, { barcodeId: barcode._id });

    expect((await anna.query(api.products.get, { productId: maito }))!.barcodes).toEqual([]);
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).toMatchObject({ unknown: true });

    await anna.mutation(api.barcodes.link, removed);

    expect((await anna.query(api.products.get, { productId: maito }))!.barcodes.map((b) => b.code)).toEqual([
      MAITO_VALIO,
    ]);
    expect(await stockOf(anna, "Maito")).toBe(1);
  });

  test("deleting Maito removes its Barcodes, and undoing the delete brings them back", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    await anna.mutation(api.barcodes.link, { code: MAITO_ARLA, productId: maito });

    const deleted = await anna.mutation(api.products.remove, { productId: maito });

    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).toMatchObject({ unknown: true });
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_ARLA, mode: "add" })).toMatchObject({ unknown: true });

    const restored = await anna.mutation(api.products.restore, deleted);

    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).toMatchObject({
      productId: restored,
      from: 1,
      to: 2,
    });
    const page = await anna.query(api.products.get, { productId: restored });
    expect(page!.barcodes.map((barcode) => barcode.code).sort()).toEqual([MAITO_ARLA, MAITO_VALIO].sort());
  });

  test("undoing Maito's delete leaves out a Barcode that was linked to another Product meanwhile", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    const deleted = await anna.mutation(api.products.remove, { productId: maito });
    const kerma = await anna.mutation(api.barcodes.linkNew, {
      code: MAITO_VALIO,
      name: "Kerma",
      locationId: await locationId(anna, "Jääkaappi"),
      mode: "add",
    });

    const restored = await anna.mutation(api.products.restore, deleted);

    expect((await anna.query(api.products.get, { productId: restored }))!.barcodes).toEqual([]);
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).toMatchObject({
      productId: kerma.productId,
    });
  });

  test("a UPC-A code read as 12 digits is the same Barcode as its 13-digit form", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    await anna.mutation(api.barcodes.link, { code: "036000291452", productId: maito, mode: "add" });

    expect(await anna.mutation(api.barcodes.scan, { code: "0036000291452", mode: "add" })).toMatchObject({
      productId: maito,
    });
  });
});
