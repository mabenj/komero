import { describe, expect, test } from "vitest";
import { splitAtMatch } from "./highlight";

describe("the part of a suggestion's name that matches the typed text", () => {
  test("is found in any case, wherever it is in the name", () => {
    expect(splitAtMatch("Kevytmaito", "  MAIT ")).toEqual(["Kevyt", "mait", "o"]);
  });

  test("is nothing when the name doesn't contain the text", () => {
    expect(splitAtMatch("Maissi", "mait")).toEqual(["Maissi", "", ""]);
  });
});
