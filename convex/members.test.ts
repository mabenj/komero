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

  test("a new Member goes by the Name they gave at sign-up, tidied", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com", undefined, "  Anna   Virtanen ");

    expect(await anna.query(api.members.list, {})).toEqual([
      expect.objectContaining({ name: "Anna Virtanen", email: "anna@example.com" }),
    ]);
  });

  test("sign-up without a Name is rejected and leaves no account behind", async () => {
    const t = newKomero();

    await expect(signUp(t, "anna@example.com", undefined, "   ")).rejects.toThrow(/NAME_REQUIRED/);
    await expect(signIn(t, "anna@example.com")).rejects.toThrow(/InvalidAccountId/);
  });

  test("a Name can be 30 characters but no longer", async () => {
    const t = newKomero();
    await expect(signUp(t, "anna@example.com", undefined, "A".repeat(31))).rejects.toThrow(/NAME_TOO_LONG/);

    const anna = await signUp(t, "anna@example.com", undefined, "A".repeat(30));
    expect(await anna.query(api.members.list, {})).toEqual([expect.objectContaining({ name: "A".repeat(30) })]);
  });

  test("any Member can change another Member's Name, and everyone sees it", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const ben = await signUp(t, "ben@example.com", await anna.mutation(api.invites.create, {}));
    const benId = (await ben.query(api.members.me, {}))!._id;

    await anna.mutation(api.members.rename, { memberId: benId, name: " Iskä " });

    expect((await ben.query(api.members.list, {})).map((m) => m.name)).toEqual(["Anna", "Iskä"]);
  });

  test("a Name can't be changed to nothing", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const annaId = (await anna.query(api.members.me, {}))!._id;

    await expect(anna.mutation(api.members.rename, { memberId: annaId, name: " " })).rejects.toThrow(/NAME_REQUIRED/);
    expect((await anna.query(api.members.list, {})).map((m) => m.name)).toEqual(["Anna"]);
  });

  test("a Name can't be changed to more than 30 characters", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const annaId = (await anna.query(api.members.me, {}))!._id;

    await expect(anna.mutation(api.members.rename, { memberId: annaId, name: "A".repeat(31) })).rejects.toThrow(
      /NAME_TOO_LONG/,
    );
    expect((await anna.query(api.members.list, {})).map((m) => m.name)).toEqual(["Anna"]);
  });

  test("a visitor who isn't signed in can't change a Name", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const annaId = (await anna.query(api.members.me, {}))!._id;

    await expect(t.mutation(api.members.rename, { memberId: annaId, name: "Hacker" })).rejects.toThrow(
      /NOT_SIGNED_IN/,
    );
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
