import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "./_generated/dataModel";
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
    expect(page).toMatchObject({ name: "Maito", locationName: "Jääkaappi", categoryName: null, stock: 1 });
    expect(page!.barcodes.map((barcode) => barcode.code)).toEqual([MAITO_VALIO]);

    const scanned = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });

    expect(scanned).toMatchObject({ unknown: false, name: "Maito", action: "restock", from: 1, to: 2 });
    expect(await stockOf(anna, "Maito")).toBe(2);
  });

  test("New Product sent ×3 with a date in Add mode: Stock 3 with that Expiry Date, and the next scan Restocks +1", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    const sent = await anna.mutation(api.barcodes.linkNew, {
      code: MAITO_VALIO,
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
      expiryKind: "bestBefore",
      mode: "add",
      quantity: 3,
      expiryDate: "2026-10-25",
    });

    expect(sent).toMatchObject({ created: true, code: MAITO_VALIO, action: "restock", from: 0, to: 3 });
    expect(await anna.query(api.products.get, { productId: sent.productId })).toMatchObject({
      stock: 3,
      expiryDate: "2026-10-25",
    });
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).toMatchObject({ from: 3, to: 4 });
  });

  test("Need more ×3 on an unknown barcode: an Out of Stock Product with an Entry of 3; Use ignores the quantity", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const kaappi = await locationId(anna, "Kaappi");

    const unknown = { locationId: kaappi, quantity: 3 };
    await anna.mutation(api.barcodes.linkNew, { ...unknown, code: MAITO_VALIO, name: "Tonnikala", mode: "needMore" });
    await anna.mutation(api.barcodes.linkNew, { ...unknown, code: MAITO_ARLA, name: "Kahvi", mode: "use", expiryDate: "2026-10-25" });

    const list = await anna.query(api.shoppingList.get, {});
    expect(list.other.map((entry) => `${entry.name} ×${entry.quantity}`)).toEqual(["Tonnikala ×3"]);
    expect(await stockOf(anna, "Tonnikala")).toBe(0);
    expect(await stockOf(anna, "Kahvi")).toBe(0);
  });

  test("New Product in Need more mode, in the chosen Category: Out of Stock and on the list under that Category", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const siivous = (await anna.query(api.categories.list, {})).find((c) => c.name === "Siivous ja koti")!._id;

    const linked = await anna.mutation(api.barcodes.linkNew, {
      code: MAITO_VALIO,
      name: "Tiskiaine",
      locationId: await locationId(anna, "Siivouskomero"),
      categoryId: siivous,
      mode: "needMore",
    });

    expect(linked).toMatchObject({ action: "needMore", name: "Tiskiaine", to: 0, quantity: 1 });
    const list = await anna.query(api.shoppingList.get, {});
    expect(list.categories.map((category) => [category.name, category.entries.map((e) => e.name)])).toEqual([
      ["Siivous ja koti", ["Tiskiaine"]],
    ]);
    expect(await stockOf(anna, "Tiskiaine")).toBe(0);
  });

  test("typing the name of an existing Product, in any case, sent ×2 adds the barcode and 2 packages to it, in its own Location", async () => {
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
      quantity: 2,
    });

    expect(linked).toMatchObject({ productId: maito, created: false, from: 1, to: 3 });
    const inventory = await anna.query(api.inventory.get, {});
    expect(inventory.flatMap((location) => location.products.map((product) => [location.name, product.name]))).toEqual([
      ["Jääkaappi", "Maito"],
    ]);
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "use" })).toMatchObject({ productId: maito });
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
  return list.bag.other.map((entry) => `${entry.name} ×${entry.quantity}`);
}

describe("Add mode", () => {
  test("a scan Restocks +1 even while Maito is in the Bag, and the Bag Entry stays", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    const [entry] = (await anna.query(api.shoppingList.get, {})).other;
    await anna.mutation(api.shoppingList.tick, { entryId: entry._id });

    const scanned = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });

    expect(scanned).toMatchObject({ action: "restock", from: 1, to: 2 });
    expect(await bag(anna)).toEqual(["Maito ×2"]);
  });

  test("a scan tells the Product's Expiry Kind, so the date prompt shows only for Products with one", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).toMatchObject({
      expiryKind: null,
    });

    await anna.mutation(api.products.update, { productId: maito, expiryKind: "bestBefore" });

    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).toMatchObject({
      expiryKind: "bestBefore",
    });
  });
});

describe("The date prompt on Add scans", () => {
  async function expiryOf(member: MemberSession, productId: Id<"products">) {
    const page = await member.query(api.products.get, { productId });
    return { stock: page?.stock, date: page?.expiryDate };
  }

  test("a dated Restock via scan: from Out of Stock the date becomes the Expiry Date, then the earlier date is kept", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    await anna.mutation(api.products.update, { productId: maito, expiryKind: "useBy" });
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });

    const first = await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });
    expect(first).toMatchObject({ action: "restock", from: 0, to: 1, asksForDate: true });
    await anna.mutation(api.barcodes.dateScan, { productId: maito, expiryDate: "2026-10-25" });
    expect(await expiryOf(anna, maito)).toEqual({ stock: 1, date: "2026-10-25" });

    await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });
    await anna.mutation(api.barcodes.dateScan, { productId: maito, expiryDate: "2026-10-30" });
    expect(await expiryOf(anna, maito)).toEqual({ stock: 2, date: "2026-10-25" });

    await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" });
    await anna.mutation(api.barcodes.dateScan, { productId: maito, expiryDate: "2026-10-20" });
    expect(await expiryOf(anna, maito)).toEqual({ stock: 3, date: "2026-10-20" });
  });

  test("Products with no Expiry Kind never ask, and Use and Need more scans never ask", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).toMatchObject({
      asksForDate: false,
    });

    await anna.mutation(api.products.update, { productId: maito, expiryKind: "useBy" });

    for (const mode of ["use", "needMore"] as const) {
      expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode })).toMatchObject({
        asksForDate: false,
      });
    }
  });

  test("a date for a Product with no Expiry Kind, or a date that isn't a calendar day, changes nothing", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);

    await anna.mutation(api.barcodes.dateScan, { productId: maito, expiryDate: "2026-10-25" });
    expect(await expiryOf(anna, maito)).toEqual({ stock: 1, date: null });

    await anna.mutation(api.products.update, { productId: maito, expiryKind: "useBy" });
    await expect(anna.mutation(api.barcodes.dateScan, { productId: maito, expiryDate: "2026-02-30" })).rejects.toThrow(
      "EXPIRY_DATE_INVALID",
    );
    expect(await expiryOf(anna, maito)).toEqual({ stock: 1, date: null });
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
    const [entry] = list.other;
    expect([entry.name, entry.quantity]).toEqual(["Maito", 2]);
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

  test("Arla's milk picked as the existing Maito and sent ×2 with a date: linked, Restocked and dated", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    await anna.mutation(api.products.update, { productId: maito, expiryKind: "useBy", expiryDate: "2026-10-30" });

    const sent = await anna.mutation(api.barcodes.link, {
      code: MAITO_ARLA,
      productId: maito,
      mode: "add",
      quantity: 2,
      expiryDate: "2026-10-22",
    });

    expect(sent).toMatchObject({ created: false, code: MAITO_ARLA, action: "restock", from: 1, to: 3 });
    expect(await anna.query(api.products.get, { productId: maito })).toMatchObject({ stock: 3, expiryDate: "2026-10-22" });
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_ARLA, mode: "use" })).toMatchObject({ productId: maito });
  });

  test("a send's date that isn't a calendar day is ignored, and a quantity below 1 is refused", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    await anna.mutation(api.products.update, { productId: maito, expiryKind: "useBy" });

    await anna.mutation(api.barcodes.link, { code: MAITO_ARLA, productId: maito, mode: "add", expiryDate: "2026-02-30" });
    expect(await anna.query(api.products.get, { productId: maito })).toMatchObject({ stock: 2, expiryDate: null });

    await expect(
      anna.mutation(api.barcodes.link, { code: "4001234567890", productId: maito, mode: "add", quantity: 0 }),
    ).rejects.toThrow(/QUANTITY_INVALID/);
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

describe("Undoing a send", () => {
  test("undoing a send that created Maito deletes Maito and its Barcode, and the barcode scans as unknown again", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const sent = await anna.mutation(api.barcodes.linkNew, {
      code: MAITO_VALIO,
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
      mode: "needMore",
      quantity: 2,
    });

    await anna.mutation(api.barcodes.undoSend, { ...sendRecord(sent), added: 2 });

    expect(await stockOf(anna, "Maito")).toBeUndefined();
    expect((await anna.query(api.shoppingList.get, {})).other).toEqual([]);
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_VALIO, mode: "add" })).toMatchObject({ unknown: true });
    expect((await anna.query(api.activities.forProduct, { productId: sent.productId })).map((a) => a.kind)).toContain(
      "delete",
    );
  });

  test("undoing a send to the existing Maito unlinks the Barcode and puts Stock and the Expiry Date back; Maito stays", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    await anna.mutation(api.products.update, { productId: maito, expiryKind: "useBy", expiryDate: "2026-10-30" });
    const sent = await anna.mutation(api.barcodes.link, {
      code: MAITO_ARLA,
      productId: maito,
      mode: "add",
      quantity: 2,
      expiryDate: "2026-10-22",
    });

    await anna.mutation(api.barcodes.undoSend, { ...sendRecord(sent!), added: 2 });

    expect(await anna.query(api.products.get, { productId: maito })).toMatchObject({
      stock: 1,
      expiryDate: "2026-10-30",
      barcodes: [{ code: MAITO_VALIO }],
    });
    expect(await anna.mutation(api.barcodes.scan, { code: MAITO_ARLA, mode: "add" })).toMatchObject({ unknown: true });
    expect((await anna.query(api.activities.forProduct, { productId: maito }))[0]).toMatchObject({
      kind: "undoStockChange",
      from: 3,
      to: 1,
    });
  });

  test("undoing a Need more ×3 send to the existing Maito takes the 3 back off its Entry", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    const sent = await anna.mutation(api.barcodes.link, { code: MAITO_ARLA, productId: maito, mode: "needMore", quantity: 3 });

    await anna.mutation(api.barcodes.undoSend, { ...sendRecord(sent!), added: 3 });

    const list = await anna.query(api.shoppingList.get, {});
    expect(list.other.map((entry) => `${entry.name} ×${entry.quantity}`)).toEqual(["Maito ×1"]);
    expect(await stockOf(anna, "Maito")).toBe(1);
  });
});

/** What the card passes back to `undoSend`, from a send's result. */
function sendRecord(sent: FunctionReturnType<typeof api.barcodes.linkNew>) {
  const { code, productId, created, from, to, expiryDateBefore } = sent;
  return { code, productId, created, from, to, expiryDateBefore, entryId: "entryId" in sent ? sent.entryId : undefined };
}

describe("The card's name match", () => {
  test("a name typed in any case finds Maito and its Location; an unknown name finds nothing", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await maitoWithBarcode(anna);

    expect(await anna.query(api.barcodes.productNamed, { name: "  MAITO " })).toEqual({
      _id: maito,
      name: "Maito",
      locationName: "Jääkaappi",
      expiryKind: null,
    });
    expect(await anna.query(api.barcodes.productNamed, { name: "Kerma" })).toBeNull();
  });

  test("a visitor who isn't signed in is refused", async () => {
    await expect(newKomero().query(api.barcodes.productNamed, { name: "Maito" })).rejects.toThrow(/NOT_SIGNED_IN/);
  });
});
