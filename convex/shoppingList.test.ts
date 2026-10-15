import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type MemberSession, newKomero, signUp } from "./test.helpers";

/** A household of two Members: Anna signs up first and invites Ben. */
async function annaAndBen() {
  const t = newKomero();
  const anna = await signUp(t, "anna@example.com");
  const ben = await signUp(t, "ben@example.com", await anna.mutation(api.invites.create, {}));
  return [anna, ben] as const;
}

async function locationId(member: MemberSession, name: string) {
  return (await member.query(api.inventory.get, {})).find((location) => location.name === name)!._id;
}

async function categoryId(member: MemberSession, name: string) {
  return (await member.query(api.categories.list, {})).find((category) => category.name === name)!._id;
}

/** A Product kept in Jääkaappi, in the named Category or in none. */
async function product(member: MemberSession, name: string, categoryName?: string) {
  const productId = await member.mutation(api.products.create, { name, locationId: await locationId(member, "Jääkaappi") });
  if (categoryName) {
    await member.mutation(api.products.update, { productId, categoryId: await categoryId(member, categoryName) });
  }
  return productId;
}

/**
 * Lista as text: each Category group's heading, then its Entries as
 * "Name ×quantity (Stock n)", then "Other"; then the Bag's groups the same way,
 * headed "In the bag: …".
 */
async function lista(member: MemberSession) {
  const list = await member.query(api.shoppingList.get, {});
  return [...groups("", list), ...groups("In the bag: ", list.bag)];
}

function groups(prefix: string, { categories, other }: { categories: { name: string; entries: Described[] }[]; other: Described[] }) {
  return [
    ...categories.map((category) => ({ group: prefix + category.name, entries: category.entries.map(described) })),
    ...(other.length > 0 ? [{ group: `${prefix}Other`, entries: other.map(described) }] : []),
  ];
}

type Described = { _id: Id<"entries">; name: string; quantity: number; stock?: number };

function described(entry: Described) {
  return entry.stock === undefined
    ? `${entry.name} ×${entry.quantity}`
    : `${entry.name} ×${entry.quantity} (Stock ${entry.stock})`;
}

async function entryId(member: MemberSession, name: string): Promise<Id<"entries">> {
  const list = await member.query(api.shoppingList.get, {});
  const entries = [list, list.bag].flatMap(({ categories, other }) => [
    ...categories.flatMap((category) => category.entries),
    ...other,
  ]);
  return entries.find((entry) => entry.name === name)!._id;
}

describe("Need More", () => {
  test("Need More puts a Product on the list under its Category, with its Stock", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Maitotuotteet");

    await anna.mutation(api.shoppingList.needMore, { productId: maito });

    expect(await lista(anna)).toEqual([{ group: "Maitotuotteet", entries: ["Maito ×1 (Stock 1)"] }]);
  });

  test("Need More on a Product already on the list raises its quantity instead of adding it again", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito", "Maitotuotteet");

    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await ben.mutation(api.shoppingList.needMore, { productId: maito });

    expect(await lista(anna)).toEqual([{ group: "Maitotuotteet", entries: ["Maito ×2 (Stock 1)"] }]);
  });
});

describe("One-offs", () => {
  test("typing a name that is already a Product links the Entry to it, in any case", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await product(anna, "Maito", "Maitotuotteet");

    await anna.mutation(api.shoppingList.addOneOff, { name: "maito" });

    expect(await lista(anna)).toEqual([{ group: "Maitotuotteet", entries: ["Maito ×1 (Stock 1)"] }]);
  });

  test("adding the same One-off again raises its quantity", async () => {
    const [anna, ben] = await annaAndBen();

    await anna.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });
    await ben.mutation(api.shoppingList.addOneOff, { name: "synttärikynttilät" });

    expect(await lista(anna)).toEqual([{ group: "Other", entries: ["Synttärikynttilät ×2"] }]);
  });

  test("a One-off needs a name", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    await expect(anna.mutation(api.shoppingList.addOneOff, { name: "  " })).rejects.toThrow(/NAME_REQUIRED/);
  });
});

describe("Entries", () => {
  test("Ben steps Anna's Maito up to 3, and the quantity never goes below 1", async () => {
    const [anna, ben] = await annaAndBen();
    await anna.mutation(api.shoppingList.needMore, { productId: await product(anna, "Maito", "Maitotuotteet") });
    const maito = await entryId(ben, "Maito");

    await ben.mutation(api.shoppingList.setQuantity, { entryId: maito, quantity: 3 });
    expect(await lista(anna)).toEqual([{ group: "Maitotuotteet", entries: ["Maito ×3 (Stock 1)"] }]);

    await ben.mutation(api.shoppingList.setQuantity, { entryId: maito, quantity: 0 });
    expect(await lista(anna)).toEqual([{ group: "Maitotuotteet", entries: ["Maito ×1 (Stock 1)"] }]);
  });

  test("a deleted Entry leaves the list, and Need More afterwards starts again at 1", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito", "Maitotuotteet");
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });

    await ben.mutation(api.shoppingList.remove, { entryId: await entryId(ben, "Maito") });
    await ben.mutation(api.shoppingList.remove, { entryId: await entryId(ben, "Synttärikynttilät") });
    expect(await lista(anna)).toEqual([]);

    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    expect(await lista(anna)).toEqual([{ group: "Maitotuotteet", entries: ["Maito ×1 (Stock 1)"] }]);
  });
});

describe("Entry delete undo", () => {
  test("undo puts deleted Entries back, adding to Need More done meanwhile, and is recorded", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito", "Maitotuotteet");
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });

    const deletedMaito = await ben.mutation(api.shoppingList.remove, { entryId: await entryId(ben, "Maito") });
    const deletedCandles = await ben.mutation(api.shoppingList.remove, {
      entryId: await entryId(ben, "Synttärikynttilät"),
    });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await ben.mutation(api.shoppingList.restore, deletedMaito);
    await ben.mutation(api.shoppingList.restore, deletedCandles);

    expect(await lista(anna)).toEqual([
      { group: "Maitotuotteet", entries: ["Maito ×3 (Stock 1)"] },
      { group: "Other", entries: ["Synttärikynttilät ×1"] },
    ]);
    const feed = await anna.query(api.activities.feed, {});
    expect(feed.slice(0, 2).map(({ kind, productName, quantity }) => ({ kind, productName, quantity }))).toEqual([
      { kind: "restoreEntry", productName: "Synttärikynttilät", quantity: 1 },
      { kind: "restoreEntry", productName: "Maito", quantity: 3 },
    ]);
  });
});

describe("Product delete", () => {
  test("deleting Maito takes its Entry off the list, and undo puts it back with its quantity", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito", "Maitotuotteet");
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });

    const deleted = await ben.mutation(api.products.remove, { productId: maito });
    expect(await lista(anna)).toEqual([]);

    const restored = await ben.mutation(api.products.restore, deleted);
    expect(await lista(anna)).toEqual([{ group: "Maitotuotteet", entries: ["Maito ×2 (Stock 1)"] }]);

    await anna.mutation(api.shoppingList.needMore, { productId: restored });
    expect(await lista(anna)).toEqual([{ group: "Maitotuotteet", entries: ["Maito ×3 (Stock 1)"] }]);
  });
});

describe("Lista", () => {
  test("Entries are grouped by Category in walking order, by name within; uncategorised Products and One-offs last under Other", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    for (const [name, category] of [
      ["Shampoo", "Kosmetiikka"],
      ["Maito", "Maitotuotteet"],
      ["Omena", "HeVi"],
      ["Juusto", "Maitotuotteet"],
      ["Kynttilät", undefined],
    ]) {
      await anna.mutation(api.shoppingList.needMore, { productId: await product(anna, name!, category) });
    }
    await anna.mutation(api.shoppingList.addOneOff, { name: " Synttärikynttilät " });
    await anna.mutation(api.shoppingList.addOneOff, { name: "Ilmapallot" });

    expect(await lista(anna)).toEqual([
      { group: "HeVi", entries: ["Omena ×1 (Stock 1)"] },
      { group: "Maitotuotteet", entries: ["Juusto ×1 (Stock 1)", "Maito ×1 (Stock 1)"] },
      { group: "Kosmetiikka", entries: ["Shampoo ×1 (Stock 1)"] },
      { group: "Other", entries: ["Ilmapallot ×1", "Kynttilät ×1 (Stock 1)", "Synttärikynttilät ×1"] },
    ]);
  });

  test("Ben renames, reorders and deletes Categories, and Anna's list follows", async () => {
    const [anna, ben] = await annaAndBen();
    for (const [name, category] of [
      ["Shampoo", "Kosmetiikka"],
      ["Maito", "Maitotuotteet"],
      ["Omena", "HeVi"],
    ]) {
      await anna.mutation(api.shoppingList.needMore, { productId: await product(anna, name, category) });
    }

    await ben.mutation(api.categories.rename, { categoryId: await categoryId(ben, "HeVi"), name: "Hedelmät" });
    await ben.mutation(api.categories.reorder, { categoryIds: [await categoryId(ben, "Kosmetiikka")] });
    expect((await lista(anna)).map(({ group }) => group)).toEqual(["Kosmetiikka", "Hedelmät", "Maitotuotteet"]);

    await ben.mutation(api.categories.remove, { categoryId: await categoryId(ben, "Maitotuotteet") });
    expect(await lista(anna)).toEqual([
      { group: "Kosmetiikka", entries: ["Shampoo ×1 (Stock 1)"] },
      { group: "Hedelmät", entries: ["Omena ×1 (Stock 1)"] },
      { group: "Other", entries: ["Maito ×1 (Stock 1)"] },
    ]);
  });

  test("changing a Product's Category moves its Entries on the list and in the Bag", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito");
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.tick, { entryId: await entryId(anna, "Maito") });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    expect(await lista(anna)).toEqual([
      { group: "Other", entries: ["Maito ×1 (Stock 1)"] },
      { group: "In the bag: Other", entries: ["Maito ×1 (Stock 1)"] },
    ]);

    await ben.mutation(api.products.update, { productId: maito, categoryId: await categoryId(ben, "Maitotuotteet") });

    expect(await lista(anna)).toEqual([
      { group: "Maitotuotteet", entries: ["Maito ×1 (Stock 1)"] },
      { group: "In the bag: Maitotuotteet", entries: ["Maito ×1 (Stock 1)"] },
    ]);
  });
});

describe("Bag and Put Away", () => {
  test("Ben ticks Maito in the shop: it moves to the Bag for Anna too, and Stock is unchanged", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito", "Maitotuotteet");
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });

    await ben.mutation(api.shoppingList.tick, { entryId: await entryId(ben, "Maito") });

    expect(await lista(anna)).toEqual([
      { group: "Other", entries: ["Synttärikynttilät ×1"] },
      { group: "In the bag: Maitotuotteet", entries: ["Maito ×2 (Stock 1)"] },
    ]);
  });

  test("unticking puts an Entry back on the list, joining Need More done since it was ticked", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito", "Maitotuotteet");
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });
    const ticked = await entryId(ben, "Maito");
    await ben.mutation(api.shoppingList.tick, { entryId: ticked });
    await ben.mutation(api.shoppingList.tick, { entryId: await entryId(ben, "Synttärikynttilät") });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });

    await ben.mutation(api.shoppingList.untick, { entryId: ticked });
    await ben.mutation(api.shoppingList.untick, { entryId: await entryId(ben, "Synttärikynttilät") });

    expect(await lista(anna)).toEqual([
      { group: "Maitotuotteet", entries: ["Maito ×2 (Stock 1)"] },
      { group: "Other", entries: ["Synttärikynttilät ×1"] },
    ]);
  });

  test("Need More Maito ×3 → tick → Stock unchanged → Put Away → Stock 4, and the Bag is empty", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito", "Maitotuotteet");
    for (let i = 0; i < 3; i++) await anna.mutation(api.shoppingList.needMore, { productId: maito });
    const ticked = await entryId(ben, "Maito");

    await ben.mutation(api.shoppingList.tick, { entryId: ticked });
    expect(await stock(anna, "Maito")).toBe(1);

    await anna.mutation(api.shoppingList.putAway, { entryId: ticked });
    expect(await stock(anna, "Maito")).toBe(4);
    expect(await lista(anna)).toEqual([]);
  });

  test("Put away all Restocks every Product in the Bag by its quantity, One-offs disappear, the rest stays on the list", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito", "Maitotuotteet");
    const shampoo = await product(anna, "Shampoo", "Kosmetiikka");
    const juusto = await product(anna, "Juusto", "Maitotuotteet");
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: shampoo });
    await anna.mutation(api.shoppingList.needMore, { productId: juusto });
    await anna.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });
    for (const name of ["Maito", "Shampoo", "Synttärikynttilät"]) {
      await ben.mutation(api.shoppingList.tick, { entryId: await entryId(ben, name) });
    }
    expect([await stock(anna, "Maito"), await stock(anna, "Shampoo")]).toEqual([1, 1]);

    await anna.mutation(api.shoppingList.putAwayAll, {});

    expect([await stock(anna, "Maito"), await stock(anna, "Shampoo"), await stock(anna, "Juusto")]).toEqual([3, 2, 1]);
    expect(await lista(anna)).toEqual([{ group: "Maitotuotteet", entries: ["Juusto ×1 (Stock 1)"] }]);
  });

  test("undoing a Put Away puts Maito ×2 back in the Bag, with its Stock and Expiry Date as before", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Maitotuotteet");
    await anna.mutation(api.products.update, { productId: maito, expiryKind: "useBy", expiryDate: "2026-10-20" });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.tick, { entryId: await entryId(anna, "Maito") });

    const putAway = await anna.mutation(api.shoppingList.putAway, {
      entryId: await entryId(anna, "Maito"),
      expiryDate: "2026-10-18",
    });
    expect(await anna.query(api.products.get, { productId: maito })).toMatchObject({
      stock: 3,
      expiryDate: "2026-10-18",
    });

    await anna.mutation(api.shoppingList.undoPutAway, putAway);

    expect(await lista(anna)).toEqual([{ group: "In the bag: Maitotuotteet", entries: ["Maito ×2 (Stock 1)"] }]);
    expect(await anna.query(api.products.get, { productId: maito })).toMatchObject({
      stock: 1,
      expiryDate: "2026-10-20",
    });
  });

  test("undoing Put away all puts the whole Bag back, One-offs too, and is recorded", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Maitotuotteet");
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });
    for (const name of ["Maito", "Synttärikynttilät"]) {
      await anna.mutation(api.shoppingList.tick, { entryId: await entryId(anna, name) });
    }

    const putAway = await anna.mutation(api.shoppingList.putAwayAll, {});
    expect(await lista(anna)).toEqual([]);
    await anna.mutation(api.shoppingList.undoPutAway, putAway);

    expect(await lista(anna)).toEqual([
      { group: "In the bag: Maitotuotteet", entries: ["Maito ×1 (Stock 1)"] },
      { group: "In the bag: Other", entries: ["Synttärikynttilät ×1"] },
    ]);
    const feed = await anna.query(api.activities.feed, {});
    expect(feed.slice(0, 2).map(({ kind, productName, from, to, quantity }) => ({ kind, productName, from, to, quantity }))).toEqual(
      expect.arrayContaining([
        { kind: "undoPutAway", productName: "Maito", from: 2, to: 1, quantity: 1 },
        { kind: "undoPutAway", productName: "Synttärikynttilät", quantity: 1 },
      ]),
    );
  });

  test("tick, untick and Put Away are recorded as Activities", async () => {
    const [anna, ben] = await annaAndBen();
    await anna.mutation(api.shoppingList.needMore, { productId: await product(anna, "Maito", "Maitotuotteet") });
    await anna.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });
    const maito = await entryId(ben, "Maito");
    await ben.mutation(api.shoppingList.tick, { entryId: maito });
    await ben.mutation(api.shoppingList.untick, { entryId: maito });
    await ben.mutation(api.shoppingList.tick, { entryId: await entryId(ben, "Maito") });
    await ben.mutation(api.shoppingList.tick, { entryId: await entryId(ben, "Synttärikynttilät") });

    await anna.mutation(api.shoppingList.putAway, { entryId: await entryId(anna, "Maito") });
    await anna.mutation(api.shoppingList.putAwayAll, {});

    const feed = await anna.query(api.activities.feed, {});
    expect(
      feed.slice(0, 5).map(({ kind, memberName, productName, from, to, quantity }) => ({
        kind,
        memberName,
        productName,
        from,
        to,
        quantity,
      })),
    ).toEqual([
      { kind: "putAway", memberName: "Anna", productName: "Synttärikynttilät", quantity: 1 },
      { kind: "putAway", memberName: "Anna", productName: "Maito", from: 1, to: 2, quantity: 1 },
      { kind: "tick", memberName: "Ben", productName: "Synttärikynttilät", quantity: 1 },
      { kind: "tick", memberName: "Ben", productName: "Maito", quantity: 1 },
      { kind: "untick", memberName: "Ben", productName: "Maito", quantity: 1 },
    ]);
  });
});

describe("One-off to Product", () => {
  test("Anna turns the One-off Kahvi into a Product in Kuivatuotteet: Out of Stock, on the list under Kuivatuotteet", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await anna.mutation(api.shoppingList.addOneOff, { name: "kahvi" });
    await anna.mutation(api.shoppingList.setQuantity, { entryId: await entryId(anna, "kahvi"), quantity: 2 });

    await anna.mutation(api.shoppingList.makeProduct, {
      entryId: await entryId(anna, "kahvi"),
      name: " Kahvi ",
      locationId: await locationId(anna, "Kaappi"),
      categoryId: await categoryId(anna, "Kuivatuotteet"),
    });

    expect(await lista(anna)).toEqual([{ group: "Kuivatuotteet", entries: ["Kahvi ×2 (Stock 0)"] }]);
    expect(await stock(anna, "Kahvi")).toBe(0);
  });

  test("a One-off turned into a Product without a Category stays under Other", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await anna.mutation(api.shoppingList.addOneOff, { name: "Kahvi" });

    await anna.mutation(api.shoppingList.makeProduct, {
      entryId: await entryId(anna, "Kahvi"),
      name: "Kahvi",
      locationId: await locationId(anna, "Kaappi"),
      categoryId: null,
    });

    expect(await lista(anna)).toEqual([{ group: "Other", entries: ["Kahvi ×1 (Stock 0)"] }]);
  });

  test("a One-off turned into a Product in the Bag Restocks it when put away", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await anna.mutation(api.shoppingList.addOneOff, { name: "Kahvi" });
    const kahvi = await entryId(anna, "Kahvi");
    await anna.mutation(api.shoppingList.tick, { entryId: kahvi });

    await anna.mutation(api.shoppingList.makeProduct, {
      entryId: kahvi,
      name: "Kahvi",
      locationId: await locationId(anna, "Kaappi"),
    });
    await anna.mutation(api.shoppingList.putAwayAll, {});

    expect(await stock(anna, "Kahvi")).toBe(1);
  });

  test("a One-off named like a Product added since links to that Product instead", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await anna.mutation(api.shoppingList.addOneOff, { name: "kahvi" });
    const kahvi = await product(anna, "Kahvi", "Kuivatuotteet");
    await anna.mutation(api.shoppingList.needMore, { productId: kahvi });

    await anna.mutation(api.shoppingList.makeProduct, {
      entryId: await entryId(anna, "kahvi"),
      name: "kahvi",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    expect(await lista(anna)).toEqual([{ group: "Kuivatuotteet", entries: ["Kahvi ×2 (Stock 1)"] }]);
  });
});

/** A Product's Stock as Koti shows it. */
async function stock(member: MemberSession, name: string) {
  const inventory = await member.query(api.inventory.get, {});
  return inventory.flatMap((location) => location.products).find((product) => product.name === name)!.stock;
}
