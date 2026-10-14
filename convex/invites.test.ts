import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { newKomero, signIn, signUp } from "./test.helpers";

describe("Invites", () => {
  test("a person with a valid Invite signs up and becomes a Member", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const token = await anna.mutation(api.invites.create, {});

    const ben = await signUp(t, "ben@example.com", token);

    expect(await ben.query(api.members.me, {})).toMatchObject({ email: "ben@example.com" });
    expect((await anna.query(api.members.list, {})).map((m) => m.email)).toEqual([
      "anna@example.com",
      "ben@example.com",
    ]);
  });

  test("an Invite works only once: a second person can't sign up with it", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const token = await anna.mutation(api.invites.create, {});
    await signUp(t, "ben@example.com", token);

    await expect(signUp(t, "stranger@example.com", token)).rejects.toThrow(/INVITE_INVALID/);
    await expect(signIn(t, "stranger@example.com")).rejects.toThrow(/InvalidAccountId/);
    expect(await anna.query(api.members.list, {})).toHaveLength(2);
  });

  describe("with a clock", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    });
    afterEach(() => vi.useRealTimers());

    test("an Invite still works on its seventh day", async () => {
      const t = newKomero();
      const anna = await signUp(t, "anna@example.com");
      const token = await anna.mutation(api.invites.create, {});

      vi.setSystemTime(new Date("2026-10-08T11:59:00Z"));
      await signUp(t, "ben@example.com", token);

      expect(await anna.query(api.members.list, {})).toHaveLength(2);
    });

    test("an Invite expires after 7 days", async () => {
      const t = newKomero();
      const anna = await signUp(t, "anna@example.com");
      const token = await anna.mutation(api.invites.create, {});

      vi.setSystemTime(new Date("2026-10-08T12:00:01Z"));

      await expect(signUp(t, "ben@example.com", token)).rejects.toThrow(/INVITE_INVALID/);
      expect(await anna.query(api.members.list, {})).toHaveLength(1);
    });
  });

  test("opening an Invite link tells whether it can still be used", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    const token = await anna.mutation(api.invites.create, {});

    expect(await t.query(api.invites.isUsable, { token })).toBe(true);
    expect(await t.query(api.invites.isUsable, { token: "not-a-real-token" })).toBe(false);

    await signUp(t, "ben@example.com", token);
    expect(await t.query(api.invites.isUsable, { token })).toBe(false);
  });

  test("a made-up Invite token is rejected", async () => {
    const t = newKomero();
    const anna = await signUp(t, "anna@example.com");
    await anna.mutation(api.invites.create, {});

    await expect(signUp(t, "stranger@example.com", "not-a-real-token")).rejects.toThrow(/INVITE_INVALID/);
    expect(await anna.query(api.members.list, {})).toHaveLength(1);
  });

  test("a visitor who isn't signed in can't create Invites or see the Members", async () => {
    const t = newKomero();
    await signUp(t, "anna@example.com");

    await expect(t.mutation(api.invites.create, {})).rejects.toThrow(/NOT_SIGNED_IN/);
    await expect(t.query(api.members.list, {})).rejects.toThrow(/NOT_SIGNED_IN/);
  });
});
