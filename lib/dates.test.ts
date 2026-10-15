import { describe, expect, test } from "vitest";
import { relativeExpiry } from "./dates";

const today = "2026-10-15";

describe("An Expiry Date relative to today", () => {
  test.each([
    ["2026-10-15", "tänään", "today"],
    ["2026-10-16", "huomenna", "tomorrow"],
    ["2026-10-14", "eilen", "yesterday"],
    ["2026-10-17", "2 pv", "2 d"],
    ["2026-10-13", "2 pv sitten", "2 d ago"],
    ["2026-10-28", "13 pv", "13 d"],
    ["2026-10-02", "13 pv sitten", "13 d ago"],
    ["2026-10-29", "2 vk", "2 wk"],
    ["2026-10-01", "2 vk sitten", "2 wk ago"],
    ["2026-11-04", "2 vk", "2 wk"],
    ["2026-12-10", "8 vk", "8 wk"],
    ["2026-08-20", "8 vk sitten", "8 wk ago"],
    ["2026-12-11", "2 kk", "2 mo"],
    ["2026-08-19", "2 kk sitten", "2 mo ago"],
    ["2027-01-20", "3 kk", "3 mo"],
    ["2027-10-15", "12 kk", "12 mo"],
    ["2025-10-15", "12 kk sitten", "12 mo ago"],
    ["2027-10-16", "yli 1 v", "1 y+"],
    ["2025-10-14", "yli 1 v sitten", "1 y+ ago"],
  ])("%s is %s / %s", (expiryDate, fi, en) => {
    expect(relativeExpiry(expiryDate, today, "fi")).toBe(fi);
    expect(relativeExpiry(expiryDate, today, "en")).toBe(en);
  });

  test("counts calendar days across a month, a year and a leap day", () => {
    expect(relativeExpiry("2027-01-01", "2026-12-31", "fi")).toBe("huomenna");
    expect(relativeExpiry("2026-12-31", "2027-01-01", "fi")).toBe("eilen");
    expect(relativeExpiry("2028-03-01", "2028-02-28", "fi")).toBe("2 pv");
  });
});
