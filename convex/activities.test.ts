import type { FunctionReturnType } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { allActivities, type MemberSession, newKomero, signUp } from "./test.helpers";

afterEach(() => vi.useRealTimers());

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

/** The Tapahtumat feed, newest first, without ids and times. */
async function feed(member: MemberSession) {
  return (await allActivities(member)).map(({ kind, memberName, productName, from, to, fromName, quantity }) => ({
    kind,
    memberName,
    productName,
    from,
    to,
    fromName,
    quantity,
  }));
}

/** A Product page's recent Activities, newest first, as "Member kind". */
async function productActivities(member: MemberSession, productId: Id<"products">) {
  const activities = await member.query(api.activities.forProduct, { productId });
  return activities.map(({ kind, memberName }) => `${memberName} ${kind}`);
}

describe("Activity feed", () => {
  test("Ben sees Anna's Use and Restock of Maito, newest first, with the Stock change", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });
    await ben.mutation(api.products.adjustStock, { productId: maito, change: "use" });

    expect(await feed(ben)).toEqual([
      { kind: "use", memberName: "Ben", productName: "Maito", from: 2, to: 1 },
      { kind: "restock", memberName: "Anna", productName: "Maito", from: 1, to: 2 },
      { kind: "create", memberName: "Anna", productName: "Maito", to: 1 },
    ]);
  });

  test("a – at 0 changes nothing and records nothing; the undo toast records its Stock change", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });
    const used = await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });

    await anna.mutation(api.products.undoStockChange, { productId: maito, from: used.from, to: used.to });

    expect(await feed(anna)).toEqual([
      { kind: "undoStockChange", memberName: "Anna", productName: "Maito", from: 0, to: 1 },
      { kind: "use", memberName: "Anna", productName: "Maito", from: 1, to: 0 },
      { kind: "create", memberName: "Anna", productName: "Maito", to: 1 },
    ]);
  });

  test("after Anna renames Kevytmaito to Maito and Ben deletes it, the feed still reads as it happened", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await anna.mutation(api.products.create, {
      name: "Kevytmaito",
      locationId: await locationId(anna, "Jääkaappi"),
    });
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });

    await anna.mutation(api.products.rename, { productId: maito, name: "Maito" });
    await ben.mutation(api.products.remove, { productId: maito });

    expect(await feed(anna)).toEqual([
      { kind: "delete", memberName: "Ben", productName: "Maito" },
      { kind: "rename", memberName: "Anna", productName: "Maito", fromName: "Kevytmaito" },
      { kind: "use", memberName: "Anna", productName: "Kevytmaito", from: 1, to: 0 },
      { kind: "create", memberName: "Anna", productName: "Kevytmaito", to: 1 },
    ]);
  });
});

describe("Settings preview", () => {
  test("Ben sees only the household's newest 5 Activities, newest first", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });
    for (let i = 0; i < 3; i++) await anna.mutation(api.products.adjustStock, { productId: maito, change: "restock" });
    await ben.mutation(api.products.adjustStock, { productId: maito, change: "use" });
    await ben.mutation(api.products.adjustStock, { productId: maito, change: "use" });

    const recent = await ben.query(api.activities.recent, {});
    expect(recent.map(({ memberName, kind, from, to }) => `${memberName} ${kind} ${from} → ${to}`)).toEqual([
      "Ben use 3 → 2",
      "Ben use 4 → 3",
      "Anna restock 3 → 4",
      "Anna restock 2 → 3",
      "Anna restock 1 → 2",
    ]);
  });

  test("a signed-out caller is refused", async () => {
    await expect(newKomero().query(api.activities.recent, {})).rejects.toThrow(/NOT_SIGNED_IN/);
  });
});

describe("Tapahtumat screen", () => {
  test("pages through every Activity newest first, with no gaps or repeats, and says when it's done", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    for (const name of ["Maito", "Juusto", "Kahvi", "Tee", "Leipä"]) {
      await anna.mutation(api.products.create, { name, locationId: await locationId(anna, "Kaappi") });
    }

    const pages: string[][] = [];
    let cursor: string | null = null;
    for (;;) {
      const result: FunctionReturnType<typeof api.activities.feed> = await anna.query(api.activities.feed, {
        paginationOpts: { numItems: 2, cursor },
      });
      pages.push(result.page.map(({ productName }) => productName));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    expect(pages.flat()).toEqual(["Leipä", "Tee", "Kahvi", "Juusto", "Maito"]);
    expect(pages.slice(0, 2)).toEqual([["Leipä", "Tee"], ["Kahvi", "Juusto"]]);
  });

  test("a signed-out caller is refused", async () => {
    await expect(
      newKomero().query(api.activities.feed, { paginationOpts: { numItems: 50, cursor: null } }),
    ).rejects.toThrow(/NOT_SIGNED_IN/);
  });
});

describe("Shopping List Activity", () => {
  test("Need More, a One-off and an Entry deletion are recorded with the quantity on the list", async () => {
    const [anna, ben] = await annaAndBen();
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });

    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await anna.mutation(api.shoppingList.needMore, { productId: maito });
    await ben.mutation(api.shoppingList.addOneOff, { name: "Synttärikynttilät" });
    const list = await ben.query(api.shoppingList.get, {});
    // Under Other, by name: Maito has no Category.
    await ben.mutation(api.shoppingList.remove, { entryId: list.other[0]._id });
    await ben.mutation(api.shoppingList.remove, { entryId: list.other[1]._id });

    expect((await feed(anna)).slice(0, 5)).toEqual([
      { kind: "removeEntry", memberName: "Ben", productName: "Synttärikynttilät", quantity: 1 },
      { kind: "removeEntry", memberName: "Ben", productName: "Maito", quantity: 2 },
      { kind: "addOneOff", memberName: "Ben", productName: "Synttärikynttilät", quantity: 1 },
      { kind: "needMore", memberName: "Anna", productName: "Maito", quantity: 2 },
      { kind: "needMore", memberName: "Anna", productName: "Maito", quantity: 1 },
    ]);
    expect(await productActivities(anna, maito)).toEqual([
      "Ben removeEntry",
      "Anna needMore",
      "Anna needMore",
      "Anna create",
    ]);
  });
});

describe("Product page Activity", () => {
  test("Maito's page shows only Maito's Activities, newest first", async () => {
    const [anna, ben] = await annaAndBen();
    const jaakaappi = await locationId(anna, "Jääkaappi");
    const maito = await anna.mutation(api.products.create, { name: "Maito", locationId: jaakaappi });
    const juusto = await anna.mutation(api.products.create, { name: "Juusto", locationId: jaakaappi });
    await ben.mutation(api.products.adjustStock, { productId: maito, change: "use" });
    await ben.mutation(api.products.adjustStock, { productId: juusto, change: "use" });

    expect(await productActivities(anna, maito)).toEqual(["Ben use", "Anna create"]);
  });

  test("a Product deleted and brought back with undo keeps its Activities, and its page goes on from there", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const kahvi = await anna.mutation(api.products.create, { name: "Kahvi", locationId: await locationId(anna, "Kaappi") });
    await anna.mutation(api.products.adjustStock, { productId: kahvi, change: "restock" });

    const deleted = await anna.mutation(api.products.remove, { productId: kahvi });
    const restored = await anna.mutation(api.products.restore, deleted);
    await anna.mutation(api.products.adjustStock, { productId: restored, change: "use" });

    expect(await productActivities(anna, restored)).toEqual([
      "Anna use",
      "Anna restore",
      "Anna delete",
      "Anna restock",
      "Anna create",
    ]);
    expect((await feed(anna)).slice(0, 2)).toEqual([
      { kind: "use", memberName: "Anna", productName: "Kahvi", from: 2, to: 1 },
      { kind: "restore", memberName: "Anna", productName: "Kahvi", to: 2 },
    ]);
  });
});

describe("Daily cleanup", () => {
  test("the daily job removes Activities older than 90 days and keeps the rest", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = newKomero();
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
    const anna = await signUp(t, "anna@example.com");
    const maito = await anna.mutation(api.products.create, {
      name: "Maito",
      locationId: await locationId(anna, "Jääkaappi"),
    });
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
    await anna.mutation(api.products.adjustStock, { productId: maito, change: "use" });

    vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
    // The one internal call in the tests: the daily cron runs it, and nothing public does (see README).
    await t.mutation(internal.activities.purgeOld, {});

    const left = await allActivities(anna);
    expect(left.map(({ kind, at }) => ({ kind, at: new Date(at).toISOString() }))).toEqual([
      { kind: "use", at: "2026-07-15T12:00:00.000Z" },
    ]);
  });
});
