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
});
