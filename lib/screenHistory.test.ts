import { describe, expect, test } from "vitest";
import { arrive, backFrom, leave, scrollFor } from "./screenHistory";

describe("Back from a Product page", () => {
  test("goes back in history when the Product page was opened within the app", () => {
    const productPage = arrive(null, { replace: false });
    expect(backFrom(productPage)).toBe("history");
  });

  test("goes to Koti when the Product page was opened from a link or a reload", () => {
    expect(backFrom(null)).toBe("koti");
    expect(backFrom({ __NA: true })).toBe("koti");
  });

  test("goes to Koti when the page it replaced was opened directly", () => {
    const opened = arrive(null, { replace: true });
    expect(backFrom(arrive(opened, { replace: true }))).toBe("koti");
  });

  test("still goes back in history after replacing a page opened within the app", () => {
    const opened = arrive(null, { replace: false });
    expect(backFrom(arrive(opened, { replace: true }))).toBe("history");
  });
});

describe("Returning to a screen", () => {
  test("scrolls to where the Member was when they left it", () => {
    const koti = leave(arrive(null, { replace: false }), 1840);
    expect(scrollFor(koti)).toBe(1840);
  });

  test("scrolls to the top of a screen that wasn't left within the app", () => {
    expect(scrollFor(null)).toBe(0);
    expect(scrollFor(arrive(null, { replace: false }))).toBe(0);
  });

  test("keeps what else the entry holds, such as Next's own state", () => {
    const left = leave({ __NA: true, inApp: true }, 300);
    expect(left).toMatchObject({ __NA: true });
    expect(backFrom(left)).toBe("history");
  });
});
