import { describe, expect, test } from "vitest";
import { byDay } from "./activityDays";

// Day boundaries are local, so the tests pin the time zone (UTC+3 in October).
process.env.TZ = "Europe/Helsinki";

const at = (local: string) => new Date(local).getTime();
const now = at("2026-10-15T09:00");

const activities = [
  { id: "a", at: at("2026-10-15T08:10") },
  { id: "b", at: at("2026-10-15T00:05") },
  { id: "c", at: at("2026-10-14T23:30") },
  { id: "d", at: at("2026-10-14T07:00") },
  { id: "e", at: at("2026-10-12T14:32") },
];

/** Each group as its header and its Activities' ids and clock times. */
const summary = (groups: ReturnType<typeof byDay<{ id: string; at: number }>>) =>
  groups.map(({ label, activities }) => [label, activities.map(({ id, time }) => `${id} ${time}`)]);

describe("Activities grouped by day", () => {
  test("today, yesterday and older days each get one group, in the order given, with clock times", () => {
    expect(summary(byDay(activities, now, "fi"))).toEqual([
      ["Tänään", ["a 8.10", "b 0.05"]],
      ["Eilen", ["c 23.30", "d 7.00"]],
      ["ma 12.10.", ["e 14.32"]],
    ]);
  });

  test("late evening stays on its own local day, though it is already the next day in UTC", () => {
    expect(new Date(at("2026-10-14T23:30")).toISOString()).toBe("2026-10-14T20:30:00.000Z");
    expect(new Date(at("2026-10-15T00:05")).toISOString()).toBe("2026-10-14T21:05:00.000Z");
    expect(summary(byDay(activities.slice(1, 3), now, "fi"))).toEqual([
      ["Tänään", ["b 0.05"]],
      ["Eilen", ["c 23.30"]],
    ]);
  });

  test("in English", () => {
    expect(summary(byDay(activities, now, "en"))).toEqual([
      ["Today", ["a 8:10 AM", "b 12:05 AM"]],
      ["Yesterday", ["c 11:30 PM", "d 7:00 AM"]],
      ["Mon, 10/12", ["e 2:32 PM"]],
    ]);
  });

  test("yesterday across a month boundary", () => {
    const groups = byDay([{ id: "x", at: at("2026-09-30T20:00") }], at("2026-10-01T06:00"), "fi");
    expect(groups.map(({ label }) => label)).toEqual(["Eilen"]);
  });

  test("no Activities, no groups", () => {
    expect(byDay([], now, "fi")).toEqual([]);
  });
});
