import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { type MemberSession, newKomero, signUp } from "./test.helpers";

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

async function productsIn(member: MemberSession, locationName: string) {
  const inventory = await member.query(api.inventory.get, {});
  return inventory
    .find((location) => location.name === locationName)!
    .products.map(({ name, stock }) => ({ name, stock }));
}

describe("Products", () => {
  test("a Product created by name alone lands in the chosen Location with Stock 1", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    await anna.mutation(api.products.create, { name: "Maito", locationId: await locationId(anna, "Jääkaappi") });

    expect(await productsIn(anna, "Jääkaappi")).toEqual([{ name: "Maito", stock: 1 }]);
    expect(await productsIn(anna, "Kaappi")).toEqual([]);
  });

  test("a Location lists its Products by name, whatever their case", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const kaappi = await locationId(anna, "Kaappi");
    for (const name of ["riisi", "Kahvi", "Öljy", "Ananas"]) {
      await anna.mutation(api.products.create, { name, locationId: kaappi });
    }

    expect((await productsIn(anna, "Kaappi")).map((p) => p.name)).toEqual(["Ananas", "Kahvi", "riisi", "Öljy"]);
  });

  test("a Product needs a name", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    await expect(
      anna.mutation(api.products.create, { name: "   ", locationId: await locationId(anna, "Kaappi") }),
    ).rejects.toThrow(/NAME_REQUIRED/);
  });
});

describe("Search", () => {
  test("typing a prefix in any case finds matching Products with their Location", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const jaakaappi = await locationId(anna, "Jääkaappi");
    await anna.mutation(api.products.create, { name: "Maito", locationId: jaakaappi });
    await anna.mutation(api.products.create, { name: "Maitorahka", locationId: jaakaappi });
    await anna.mutation(api.products.create, { name: "Maissi", locationId: await locationId(anna, "Kaappi") });
    await anna.mutation(api.products.create, { name: "Kevytmaito", locationId: jaakaappi });

    const result = await anna.query(api.products.search, { text: "  MAIT" });

    expect(result.matches.map(({ name, locationName, stock }) => ({ name, locationName, stock }))).toEqual([
      { name: "Maito", locationName: "Jääkaappi", stock: 1 },
      { name: "Maitorahka", locationName: "Jääkaappi", stock: 1 },
    ]);
    expect(result.canAdd).toBe(true);
  });

  test("with no match, the typed name can be added", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await anna.mutation(api.products.create, { name: "Maito", locationId: await locationId(anna, "Jääkaappi") });

    const result = await anna.query(api.products.search, { text: "Maissi " });

    expect(result).toEqual({ matches: [], canAdd: true, name: "Maissi", duplicate: null });
  });

  test("typing an existing name in another case warns where it already is, instead of offering to add it", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await anna.mutation(api.products.create, { name: "Maito", locationId: await locationId(anna, "Jääkaappi") });

    const result = await anna.query(api.products.search, { text: "maito" });

    expect(result.canAdd).toBe(false);
    expect(result.duplicate).toEqual({ name: "Maito", locationName: "Jääkaappi" });
  });

  test("a name close to an existing Product can be added, with a warning naming it", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await anna.mutation(api.products.create, { name: "Jäätelö", locationId: await locationId(anna, "Pakastin") });
    await anna.mutation(api.products.create, { name: "Tiskiaine", locationId: await locationId(anna, "Siivouskomero") });

    const withoutUmlauts = await anna.query(api.products.search, { text: "jaatelo" });
    expect(withoutUmlauts.canAdd).toBe(true);
    expect(withoutUmlauts.duplicate).toEqual({ name: "Jäätelö", locationName: "Pakastin" });

    const typo = await anna.query(api.products.search, { text: "Tiskiainne" });
    expect(typo.canAdd).toBe(true);
    expect(typo.duplicate).toEqual({ name: "Tiskiaine", locationName: "Siivouskomero" });
  });

  test("a different Product that merely starts the same is not a duplicate", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await anna.mutation(api.products.create, { name: "Maito", locationId: await locationId(anna, "Jääkaappi") });

    expect((await anna.query(api.products.search, { text: "Mai" })).duplicate).toBeNull();
    expect((await anna.query(api.products.search, { text: "Maitorahka" })).duplicate).toBeNull();
    expect((await anna.query(api.products.search, { text: "Muro" })).duplicate).toBeNull();
  });

  test("an empty search finds nothing and offers nothing", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await anna.mutation(api.products.create, { name: "Maito", locationId: await locationId(anna, "Jääkaappi") });

    expect(await anna.query(api.products.search, { text: "  " })).toEqual({
      matches: [],
      canAdd: false,
      name: "",
      duplicate: null,
    });
  });
});

describe("Stock", () => {
  test("+ Restocks by 1 and – Uses 1", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });
    expect(await productsIn(anna, "Jääkaappi")).toEqual([{ name: "Maito", stock: 3 }]);

    await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });
    expect(await productsIn(anna, "Jääkaappi")).toEqual([{ name: "Maito", stock: 2 }]);
  });

  test("Stock never goes below 0, and an Out of Stock Product stays on Koti", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    expect(await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" })).toEqual({
      from: 1,
      to: 0,
    });
    expect(await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" })).toEqual({
      from: 0,
      to: 0,
    });

    expect(await productsIn(anna, "Jääkaappi")).toEqual([{ name: "Maito", stock: 0 }]);
  });

  test("Anna and Ben tapping – on the same Product at the same moment both count", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });

    await Promise.all([
      anna.mutation(api.products.adjustStock, { productId: maito, change: "use" }),
      ben.mutation(api.products.adjustStock, { productId: maito, change: "use" }),
    ]);

    expect(await productsIn(anna, "Jääkaappi")).toEqual([{ name: "Maito", stock: 1 }]);
  });

  test("undoing a – puts the package back without losing Ben's change in between", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    const change = await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });
    await ben.mutation(api.products.adjustStock, { productId: maito, change: "restock" });
    await anna.mutation(api.products.undoStockChange, { productId: maito, ...change });

    expect(await productsIn(anna, "Jääkaappi")).toEqual([{ name: "Maito", stock: 2 }]);
  });

  test("undoing a – that hit the floor at 0 changes nothing", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });

    const noop = await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });
    await anna.mutation(api.products.undoStockChange, { productId: maito, ...noop });

    expect(await productsIn(anna, "Jääkaappi")).toEqual([{ name: "Maito", stock: 0 }]);
  });

  test("a Stock change on Anna's phone shows on Ben's without a refresh", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });

    expect(await productsIn(ben, "Jääkaappi")).toEqual([{ name: "Maito", stock: 2 }]);
  });
});

describe("Product page", () => {
  test("opening a Product shows its name, Home Location and Stock", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const jaakaappi = await locationId(anna, "Jääkaappi");
    const maito = await anna.mutation(api.products.create, { name: "Maito", locationId: jaakaappi });
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });

    expect(await anna.query(api.products.get, { productId: maito })).toEqual({
      _id: maito,
      name: "Maito",
      stock: 2,
      locationId: jaakaappi,
      locationName: "Jääkaappi",
    });
  });

  test("Anna renames Kevytmaito to Maito and Ben's Koti shows it under the new name, sorted, Stock kept", async () => {
    const [anna, ben] = await annaAndBen();
    const jaakaappi = await locationId(anna, "Jääkaappi");
    const maito = await anna.mutation(api.products.create, { name: "Kevytmaito", locationId: jaakaappi });
    await anna.mutation(api.products.create, { name: "Juusto", locationId: jaakaappi });
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });

    await anna.mutation(api.products.rename, { productId: maito, name: "  Maito " });

    expect(await productsIn(ben, "Jääkaappi")).toEqual([
      { name: "Juusto", stock: 1 },
      { name: "Maito", stock: 2 },
    ]);
    expect((await anna.query(api.products.search, { text: "maito" })).duplicate).toEqual({
      name: "Maito",
      locationName: "Jääkaappi",
    });
  });

  test("a Product can't be renamed to nothing", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    await expect(anna.mutation(api.products.rename, { productId: maito, name: " " })).rejects.toThrow(
      /NAME_REQUIRED/,
    );
    expect(await productsIn(anna, "Jääkaappi")).toEqual([{ name: "Maito", stock: 1 }]);
  });

  test("moving Kahvi from Kaappi to Jääkaappi shows it under Jääkaappi on Ben's Koti, Stock kept", async () => {
    const [anna, ben] = await annaAndBen();
    const kahvi = await anna.mutation(api.products.create, {
      name: "Kahvi",
      locationId: await locationId(anna, "Kaappi"),
    });
    await anna.mutation(api.products.adjustStock, { productId: kahvi, change: "restock" });

    await anna.mutation(api.products.update, { productId: kahvi, locationId: await locationId(anna, "Jääkaappi") });

    expect(await productsIn(ben, "Kaappi")).toEqual([]);
    expect(await productsIn(ben, "Jääkaappi")).toEqual([{ name: "Kahvi", stock: 2 }]);
    expect((await ben.query(api.products.get, { productId: kahvi }))?.locationName).toBe("Jääkaappi");
  });

  test("deleting Maito removes it from Koti, its page and search", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    await anna.mutation(api.products.remove, { productId: maito });

    expect(await productsIn(ben, "Jääkaappi")).toEqual([]);
    expect(await ben.query(api.products.get, { productId: maito })).toBeNull();
    expect(await ben.query(api.products.search, { text: "maito" })).toMatchObject({
      matches: [],
      canAdd: true,
      duplicate: null,
    });
  });

  test("undoing a delete brings Kahvi back to Kaappi with its Stock", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const kahvi = await anna.mutation(api.products.create, {
      name: "Kahvi",
      locationId: await locationId(anna, "Kaappi"),
    });
    await anna.mutation(api.products.adjustStock, { productId: kahvi, change: "restock" });
    await anna.mutation(api.products.adjustStock, { productId: kahvi, change: "restock" });

    const deleted = await anna.mutation(api.products.remove, { productId: kahvi });
    const restored = await anna.mutation(api.products.restore, deleted);

    expect(await productsIn(anna, "Kaappi")).toEqual([{ name: "Kahvi", stock: 3 }]);
    expect(await anna.query(api.products.get, { productId: restored })).toMatchObject({
      name: "Kahvi",
      stock: 3,
      locationName: "Kaappi",
    });
  });
});
