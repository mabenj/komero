import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { type MemberSession, newKomero, signUp } from "./test.helpers";

const DEFAULTS = [
  "HeVi",
  "Leivät",
  "Maitotuotteet",
  "Liha ja kala",
  "Kuivatuotteet",
  "Pakasteet",
  "Juomat",
  "Kosmetiikka",
  "Siivous ja koti",
];

async function categories(member: MemberSession) {
  return (await member.query(api.categories.list, {})).map((category) => category.name);
}

describe("Categories", () => {
  test("a new household starts with the default Categories in a typical walking order", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    expect(await categories(anna)).toEqual(DEFAULTS);
  });

  test("an added Category goes last, its name tidied", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    await anna.mutation(api.categories.create, { name: "  Lemmikit " });

    expect(await categories(anna)).toEqual([...DEFAULTS, "Lemmikit"]);
  });

  test("a Category needs a name", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const [hevi] = await anna.query(api.categories.list, {});

    await expect(anna.mutation(api.categories.create, { name: " " })).rejects.toThrow(/NAME_REQUIRED/);
    await expect(anna.mutation(api.categories.rename, { categoryId: hevi._id, name: "" })).rejects.toThrow(
      /NAME_REQUIRED/,
    );
  });

  test("a renamed Category keeps its place", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const [hevi] = await anna.query(api.categories.list, {});

    await anna.mutation(api.categories.rename, { categoryId: hevi._id, name: " Hedelmät ja vihannekset" });

    expect(await categories(anna)).toEqual(["Hedelmät ja vihannekset", ...DEFAULTS.slice(1)]);
  });

  test("reordering Categories puts them in the walking order for every Member", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const ben = await signUp(t, "ben@example.com", await anna.mutation(api.invites.create, {}));
    const ids = await categoryIds(anna);

    await anna.mutation(api.categories.reorder, {
      categoryIds: [ids.Juomat, ids.HeVi, ...DEFAULTS.filter((n) => n !== "Juomat" && n !== "HeVi").map((n) => ids[n])],
    });

    expect(await categories(ben)).toEqual(["Juomat", "HeVi", ...DEFAULTS.filter((n) => n !== "Juomat" && n !== "HeVi")]);
  });

  test("reordering keeps a Category added meanwhile last and skips one deleted meanwhile", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const ben = await signUp(t, "ben@example.com", await anna.mutation(api.invites.create, {}));
    const ids = await categoryIds(anna);

    await ben.mutation(api.categories.create, { name: "Lemmikit" });
    await ben.mutation(api.categories.remove, { categoryId: ids.Juomat });
    await anna.mutation(api.categories.reorder, { categoryIds: [ids.Juomat, ids.Kosmetiikka, ids.HeVi] });

    expect(await categories(anna)).toEqual([
      "Kosmetiikka",
      "HeVi",
      "Leivät",
      "Maitotuotteet",
      "Liha ja kala",
      "Kuivatuotteet",
      "Pakasteet",
      "Siivous ja koti",
      "Lemmikit",
    ]);
  });

  test("deleting a Category with Products leaves them without a Category", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const { HeVi } = await categoryIds(anna);
    const kaappi = (await anna.query(api.inventory.get, {})).find((location) => location.name === "Kaappi")!._id;
    const omena = await anna.mutation(api.products.create, { name: "Omena", locationId: kaappi });
    await anna.mutation(api.products.update, { productId: omena, categoryId: HeVi });

    await anna.mutation(api.categories.remove, { categoryId: HeVi });

    expect(await categories(anna)).toEqual(DEFAULTS.slice(1));
    expect(await anna.query(api.products.get, { productId: omena })).toMatchObject({
      name: "Omena",
      categoryId: null,
      categoryName: null,
    });
  });

  test("every Category can be deleted, the last one too", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    for (const categoryId of Object.values(await categoryIds(anna))) {
      await anna.mutation(api.categories.remove, { categoryId });
    }

    expect(await categories(anna)).toEqual([]);
  });

  test("the one-off seed adds the defaults to a household without Categories, and only then", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    for (const categoryId of Object.values(await categoryIds(anna))) {
      await anna.mutation(api.categories.remove, { categoryId });
    }

    await t.mutation(internal.categories.seedDefaults, {});
    expect(await categories(anna)).toEqual(DEFAULTS);

    await anna.mutation(api.categories.create, { name: "Lemmikit" });
    await t.mutation(internal.categories.seedDefaults, {});
    expect(await categories(anna)).toEqual([...DEFAULTS, "Lemmikit"]);
  });
});

async function categoryIds(member: MemberSession) {
  return Object.fromEntries((await member.query(api.categories.list, {})).map((c) => [c.name, c._id]));
}
