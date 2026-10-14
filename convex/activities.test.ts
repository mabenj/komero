import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type MemberSession, newKomero, signUp } from "./test.helpers";

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

/** The ⚙ Activity feed, newest first, without ids and times. */
async function feed(member: MemberSession) {
  const activities = await member.query(api.activities.feed, {});
  return activities.map(({ kind, memberName, productName, from, to, fromName }) => ({
    kind,
    memberName,
    productName,
    from,
    to,
    fromName,
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
      { kind: "use", memberName: "ben", productName: "Maito", from: 2, to: 1 },
      { kind: "restock", memberName: "anna", productName: "Maito", from: 1, to: 2 },
      { kind: "create", memberName: "anna", productName: "Maito", to: 1 },
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

    await anna.mutation(api.products.undoStockChange, { productId: maito, ...used });

    expect(await feed(anna)).toEqual([
      { kind: "undoStockChange", memberName: "anna", productName: "Maito", from: 0, to: 1 },
      { kind: "use", memberName: "anna", productName: "Maito", from: 1, to: 0 },
      { kind: "create", memberName: "anna", productName: "Maito", to: 1 },
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
      { kind: "delete", memberName: "ben", productName: "Maito" },
      { kind: "rename", memberName: "anna", productName: "Maito", fromName: "Kevytmaito" },
      { kind: "use", memberName: "anna", productName: "Kevytmaito", from: 1, to: 0 },
      { kind: "create", memberName: "anna", productName: "Kevytmaito", to: 1 },
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

    expect(await productActivities(anna, maito)).toEqual(["ben use", "anna create"]);
  });

  test("a Product deleted and brought back with undo keeps its history, and its page goes on from there", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const kahvi = await anna.mutation(api.products.create, { name: "Kahvi", locationId: await locationId(anna, "Kaappi") });
    await anna.mutation(api.products.adjustStock, { productId: kahvi, change: "restock" });

    const deleted = await anna.mutation(api.products.remove, { productId: kahvi });
    const restored = await anna.mutation(api.products.restore, deleted);
    await anna.mutation(api.products.adjustStock, { productId: restored, change: "use" });

    expect(await productActivities(anna, restored)).toEqual([
      "anna use",
      "anna restore",
      "anna delete",
      "anna restock",
      "anna create",
    ]);
    expect((await feed(anna)).slice(0, 2)).toEqual([
      { kind: "use", memberName: "anna", productName: "Kahvi", from: 2, to: 1 },
      { kind: "restore", memberName: "anna", productName: "Kahvi", to: 2 },
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
    await t.mutation(internal.activities.purgeOld, {});

    const left = await anna.query(api.activities.feed, {});
    expect(left.map(({ kind, at }) => ({ kind, at: new Date(at).toISOString() }))).toEqual([
      { kind: "use", at: "2026-07-15T12:00:00.000Z" },
    ]);
  });
});
