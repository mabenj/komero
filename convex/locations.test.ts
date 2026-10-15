import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { type MemberSession, newKomero, signUp } from "./test.helpers";

async function kotiLocations(member: MemberSession) {
  return (await member.query(api.inventory.get, {})).map((location) => location.name);
}

async function locationId(member: MemberSession, name: string) {
  const inventory = await member.query(api.inventory.get, {});
  return inventory.find((location) => location.name === name)!._id;
}

async function productNamesIn(member: MemberSession, locationName: string) {
  const inventory = await member.query(api.inventory.get, {});
  return inventory.find((location) => location.name === locationName)!.products.map((product) => product.name);
}

describe("Locations", () => {
  test("a new household starts with the five default Locations", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    expect(await kotiLocations(anna)).toEqual(["Jääkaappi", "Pakastin", "Kaappi", "Kylpyhuone", "Siivouskomero"]);
  });

  test("an added Location appears last on Koti", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    await anna.mutation(api.locations.create, { name: "  Kellari " });

    expect(await kotiLocations(anna)).toEqual([
      "Jääkaappi",
      "Pakastin",
      "Kaappi",
      "Kylpyhuone",
      "Siivouskomero",
      "Kellari",
    ]);
  });

  test("a renamed Location keeps its place and its Products", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const kaappi = await locationId(anna, "Kaappi");
    await anna.mutation(api.products.create, { name: "Kahvi", locationId: kaappi });

    await anna.mutation(api.locations.rename, { locationId: kaappi, name: "Ruokakaappi" });

    expect(await kotiLocations(anna)).toEqual(["Jääkaappi", "Pakastin", "Ruokakaappi", "Kylpyhuone", "Siivouskomero"]);
    expect(await productNamesIn(anna, "Ruokakaappi")).toEqual(["Kahvi"]);
  });

  test("reordering Locations regroups Koti in the new order for every Member", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const ben = await signUp(t, "ben@example.com", await anna.mutation(api.invites.create, {}));
    const ids = Object.fromEntries((await anna.query(api.inventory.get, {})).map((l) => [l.name, l._id]));

    await anna.mutation(api.locations.reorder, {
      locationIds: [ids.Kaappi, ids.Jääkaappi, ids.Siivouskomero, ids.Pakastin, ids.Kylpyhuone],
    });

    expect(await kotiLocations(ben)).toEqual(["Kaappi", "Jääkaappi", "Siivouskomero", "Pakastin", "Kylpyhuone"]);
  });

  test("a Location added on another phone while reordering stays last", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const ben = await signUp(t, "ben@example.com", await anna.mutation(api.invites.create, {}));
    const ids = Object.fromEntries((await anna.query(api.inventory.get, {})).map((l) => [l.name, l._id]));

    await ben.mutation(api.locations.create, { name: "Kellari" });
    await anna.mutation(api.locations.reorder, {
      locationIds: [ids.Pakastin, ids.Jääkaappi, ids.Kaappi, ids.Kylpyhuone, ids.Siivouskomero],
    });

    expect(await kotiLocations(anna)).toEqual([
      "Pakastin",
      "Jääkaappi",
      "Kaappi",
      "Kylpyhuone",
      "Siivouskomero",
      "Kellari",
    ]);
  });

  test("an empty Location is deleted straight away", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    await anna.mutation(api.locations.remove, { locationId: await locationId(anna, "Kylpyhuone") });

    expect(await kotiLocations(anna)).toEqual(["Jääkaappi", "Pakastin", "Kaappi", "Siivouskomero"]);
  });

  test("a Location that still has Products is not deleted without a Location to move them to", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const kylpyhuone = await locationId(anna, "Kylpyhuone");
    await anna.mutation(api.products.create, { name: "Shampoo", locationId: kylpyhuone });

    await expect(anna.mutation(api.locations.remove, { locationId: kylpyhuone })).rejects.toThrow(
      /MOVE_TARGET_REQUIRED/,
    );

    expect(await productNamesIn(anna, "Kylpyhuone")).toEqual(["Shampoo"]);
  });

  test("deleting a Location moves every one of its Products to the chosen Location", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const kylpyhuone = await locationId(anna, "Kylpyhuone");
    const siivouskomero = await locationId(anna, "Siivouskomero");
    for (const name of ["Shampoo", "Hammastahna", "Saippua"]) {
      await anna.mutation(api.products.create, { name, locationId: kylpyhuone });
    }
    await anna.mutation(api.products.create, { name: "Tiskiaine", locationId: siivouskomero });

    await anna.mutation(api.locations.remove, { locationId: kylpyhuone, moveProductsTo: siivouskomero });

    expect(await kotiLocations(anna)).toEqual(["Jääkaappi", "Pakastin", "Kaappi", "Siivouskomero"]);
    expect(await productNamesIn(anna, "Siivouskomero")).toEqual(["Hammastahna", "Saippua", "Shampoo", "Tiskiaine"]);
  });

  test("Products can't be moved to the Location being deleted, or to one that no longer exists", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const kylpyhuone = await locationId(anna, "Kylpyhuone");
    const kellari = await anna.mutation(api.locations.create, { name: "Kellari" });
    await anna.mutation(api.products.create, { name: "Shampoo", locationId: kylpyhuone });
    await anna.mutation(api.locations.remove, { locationId: kellari });

    await expect(
      anna.mutation(api.locations.remove, { locationId: kylpyhuone, moveProductsTo: kylpyhuone }),
    ).rejects.toThrow(/MOVE_TARGET_INVALID/);
    await expect(
      anna.mutation(api.locations.remove, { locationId: kylpyhuone, moveProductsTo: kellari }),
    ).rejects.toThrow(/MOVE_TARGET_INVALID/);

    expect(await productNamesIn(anna, "Kylpyhuone")).toEqual(["Shampoo"]);
  });

  test("the last Location can't be deleted", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    for (const name of ["Jääkaappi", "Pakastin", "Kaappi", "Kylpyhuone"]) {
      await anna.mutation(api.locations.remove, { locationId: await locationId(anna, name) });
    }

    await expect(
      anna.mutation(api.locations.remove, { locationId: await locationId(anna, "Siivouskomero") }),
    ).rejects.toThrow(/LAST_LOCATION/);
    expect(await kotiLocations(anna)).toEqual(["Siivouskomero"]);
  });

  test("a Location needs a name", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");

    await expect(anna.mutation(api.locations.create, { name: " " })).rejects.toThrow(/NAME_REQUIRED/);
    await expect(
      anna.mutation(api.locations.rename, { locationId: await locationId(anna, "Kaappi"), name: "" }),
    ).rejects.toThrow(/NAME_REQUIRED/);
  });
});
