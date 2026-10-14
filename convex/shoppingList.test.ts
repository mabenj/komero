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
  const inventory = await member.query(api.inventory.get, {});
  return inventory.find((location) => location.name === name)!._id;
}

async function product(member: MemberSession, name: string, locationName: string) {
  return member.mutation(api.products.create, { name, locationId: await locationId(member, locationName) });
}

/** Lista as text: each group's heading, then its Entries as "Name ×quantity (Stock n)". */
async function lista(member: MemberSession) {
  const list = await member.query(api.shoppingList.get, {});
  return [
    ...list.locations.map((location) => ({
      group: location.name,
      entries: location.entries.map((entry) => `${entry.name} ×${entry.quantity} (Stock ${entry.stock})`),
    })),
    ...(list.oneOffs.length > 0
      ? [{ group: "Other", entries: list.oneOffs.map((entry) => `${entry.name} ×${entry.quantity}`) }]
      : []),
  ];
}

async function entryId(member: MemberSession, name: string): Promise<Id<"entries">> {
  const list = await member.query(api.shoppingList.get, {});
  const entries = [...list.locations.flatMap((location) => location.entries), ...list.oneOffs];
  return entries.find((entry) => entry.name === name)!._id;
}

describe("Need More", () => {
  test("Need More puts a Product on the list under its Home Location, with its Stock", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await product(anna, "Maito", "Jääkaappi");

    await anna.mutation(api.shoppingList.needMore, { productId: maito });

    expect(await lista(anna)).toEqual([{ group: "Jääkaappi", entries: ["Maito ×1 (Stock 1)"] }]);
  });

  test("Need More on a Product already on the list raises its quantity instead of adding it again", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito", "Jääkaappi");

    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await ben.mutation(api.shoppingList.needMore, { productId: maito });

    expect(await lista(anna)).toEqual([{ group: "Jääkaappi", entries: ["Maito ×2 (Stock 1)"] }]);
  });
});

describe("One-offs", () => {
  test("typing a name that is already a Product links the Entry to it, in any case", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    await product(anna, "Maito", "Jääkaappi");

    await anna.mutation(api.shoppingList.addOneOff, { name: "maito" });

    expect(await lista(anna)).toEqual([{ group: "Jääkaappi", entries: ["Maito ×1 (Stock 1)"] }]);
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
    await anna.mutation(api.shoppingList.needMore, { productId: await product(anna, "Maito", "Jääkaappi") });
    const maito = await entryId(ben, "Maito");

    await ben.mutation(api.shoppingList.setQuantity, { entryId: maito, quantity: 3 });
    expect(await lista(anna)).toEqual([{ group: "Jääkaappi", entries: ["Maito ×3 (Stock 1)"] }]);

    await ben.mutation(api.shoppingList.setQuantity, { entryId: maito, quantity: 0 });
    expect(await lista(anna)).toEqual([{ group: "Jääkaappi", entries: ["Maito ×1 (Stock 1)"] }]);
  });

  test("a deleted Entry leaves the list, and Need More afterwards starts again at 1", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await product(anna, "Maito", "Jääkaappi");
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });

    await ben.mutation(api.shoppingList.remove, { entryId: await entryId(ben, "Maito") });
    await ben.mutation(api.shoppingList.remove, { entryId: await entryId(ben, "Synttärikynttilät") });
    expect(await lista(anna)).toEqual([]);

    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    expect(await lista(anna)).toEqual([{ group: "Jääkaappi", entries: ["Maito ×1 (Stock 1)"] }]);
  });
});

describe("Lista", () => {
  test("Entries are grouped by Home Location in the household's Location order, One-offs last under Other", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    for (const [name, location] of [
      ["Shampoo", "Kylpyhuone"],
      ["Maito", "Jääkaappi"],
      ["Jäätelö", "Pakastin"],
      ["Juusto", "Jääkaappi"],
    ]) {
      await anna.mutation(api.shoppingList.needMore, { productId: await product(anna, name, location) });
    }
    await anna.mutation(api.shoppingList.addOneOff, { name: " Synttärikynttilät " });

    expect(await lista(anna)).toEqual([
      { group: "Jääkaappi", entries: ["Juusto ×1 (Stock 1)", "Maito ×1 (Stock 1)"] },
      { group: "Pakastin", entries: ["Jäätelö ×1 (Stock 1)"] },
      { group: "Kylpyhuone", entries: ["Shampoo ×1 (Stock 1)"] },
      { group: "Other", entries: ["Synttärikynttilät ×1"] },
    ]);

    const kylpyhuone = await locationId(anna, "Kylpyhuone");
    await anna.mutation(api.locations.reorder, { locationIds: [kylpyhuone] });

    expect((await lista(anna)).map(({ group }) => group)).toEqual(["Kylpyhuone", "Jääkaappi", "Pakastin", "Other"]);
  });
});
