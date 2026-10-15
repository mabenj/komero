import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { newKomero, signIn, signUp } from "./test.helpers";

describe("Members", () => {
  test("with no Members yet, sign-up creates the first Member", async () => {
    const t = newKomero();
    expect(await t.query(api.members.isFirstRun, {})).toBe(true);

    const anna = await signUp(t, "anna@example.com");

    expect(await anna.query(api.members.me, {})).toMatchObject({ email: "anna@example.com" });
    expect(await t.query(api.members.isFirstRun, {})).toBe(false);
  });

  test("once a Member exists, sign-up without an Invite is rejected", async () => {
    const t = newKomero();
    await signUp(t, "anna@example.com");

    await expect(signUp(t, "stranger@example.com")).rejects.toThrow(/INVITE_INVALID/);
    // No account was left behind: the stranger can't sign in either.
    await expect(signIn(t, "stranger@example.com")).rejects.toThrow(/InvalidAccountId/);
  });

  test("a Member can sign in again later", async () => {
    const t = newKomero();
    await signUp(t, "anna@example.com");

    const anna = await signIn(t, "anna@example.com");

    expect(await anna.query(api.members.me, {})).toMatchObject({ email: "anna@example.com" });
  });

  test("a new Member speaks Finnish until they choose otherwise", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");

    expect(await anna.query(api.members.me, {})).toMatchObject({ language: "fi" });
  });

  test("a Member's language choice follows them to another device", async () => {
    const t = newKomero();
    const annaOnPhone = await signUp(t, "anna@example.com");

    await annaOnPhone.mutation(api.members.setLanguage, { language: "en" });

    const annaOnTablet = await signIn(t, "anna@example.com");
    expect(await annaOnTablet.query(api.members.me, {})).toMatchObject({ language: "en" });
  });

  test("a Member can switch back to Finnish", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    await anna.mutation(api.members.setLanguage, { language: "en" });
    await anna.mutation(api.members.setLanguage, { language: "fi" });

    expect(await anna.query(api.members.me, {})).toMatchObject({ language: "fi" });
  });

  test("a visitor who isn't signed in can't set a language", async () => {
    const t = newKomero();
    await signUp(t, "anna@example.com");

    await expect(t.mutation(api.members.setLanguage, { language: "en" })).rejects.toThrow(/NOT_SIGNED_IN/);
  });
});
