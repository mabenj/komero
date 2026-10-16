import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { type MemberSession, newKomero, signUp } from "./test.helpers";

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

describe("Adding Products", () => {
  test("filling the fridge on day one: each Product added to Jääkaappi lands there with Stock 1", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const jaakaappi = await locationId(anna, "Jääkaappi");

    for (const name of ["Maito", "Voi", " Juusto ", "Kananmunat"]) {
      await anna.mutation(api.products.create, { name, locationId: jaakaappi });
    }

    expect(await productsIn(anna, "Jääkaappi")).toEqual([
      { name: "Juusto", stock: 1 },
      { name: "Kananmunat", stock: 1 },
      { name: "Maito", stock: 1 },
      { name: "Voi", stock: 1 },
    ]);
    expect(await productsIn(anna, "Pakastin")).toEqual([]);
  });

  test("a name that already exists, in any case, is only warned about: adding it anyway adds a second Product", async () => {
    const anna = await signUp(newKomero(), "anna@example.com");
    const jaakaappi = await locationId(anna, "Jääkaappi");
    await anna.mutation(api.products.create, { name: "Maito", locationId: jaakaappi });

    expect((await anna.query(api.products.search, { text: "maito" })).duplicate).toEqual({
      name: "Maito",
      locationName: "Jääkaappi",
    });
    await anna.mutation(api.products.create, { name: "maito", locationId: await locationId(anna, "Kaappi") });

    expect(await productsIn(anna, "Jääkaappi")).toEqual([{ name: "Maito", stock: 1 }]);
    expect(await productsIn(anna, "Kaappi")).toEqual([{ name: "maito", stock: 1 }]);
  });
});
