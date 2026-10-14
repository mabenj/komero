import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { newKomero, signIn, signUp } from "./test.helpers";

const DEFAULT_LOCATIONS = ["Jääkaappi", "Pakastin", "Kaappi", "Kylpyhuone", "Siivouskomero"];

describe("Inventory", () => {
  test("the first Member finds the five default Locations on Koti, in order and empty", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");

    const inventory = await anna.query(api.inventory.get, {});

    expect(inventory.map((location) => location.name)).toEqual(DEFAULT_LOCATIONS);
    expect(inventory.every((location) => location.products.length === 0)).toBe(true);
  });

  test("the default Locations are seeded only once", async () => {
    const t = newKomero();
    await signUp(t, "anna@example.com");
    await expect(signUp(t, "stranger@example.com")).rejects.toThrow(/INVITE_INVALID/);

    const anna = await signIn(t, "anna@example.com");

    expect((await anna.query(api.inventory.get, {})).map((l) => l.name)).toEqual(DEFAULT_LOCATIONS);
  });

  test("a visitor who isn't signed in can't see the Inventory", async () => {
    const t = newKomero();
    await signUp(t, "anna@example.com");

    await expect(t.query(api.inventory.get, {})).rejects.toThrow(/NOT_SIGNED_IN/);
  });
});
