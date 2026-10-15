import { describe, expect, test } from "vitest";
import { sortProducts } from "./sortProducts";

const product = (name: string, stock: number, expiryDate: string | null = null) => ({
  name,
  stock,
  expiryKind: expiryDate ? ("bestBefore" as const) : null,
  expiryDate,
});
const names = (products: { name: string }[]) => products.map((p) => p.name);

describe("Sorting a Location's Products", () => {
  const products = [product("Öljy", 1), product("Avokado", 3), product("Äyriäiset", 2), product("Zucchini", 1)];

  test("by name, with ä and ö after z in Finnish", () => {
    expect(names(sortProducts(products, "name", "asc", "fi"))).toEqual(["Avokado", "Zucchini", "Äyriäiset", "Öljy"]);
    expect(names(sortProducts(products, "name", "desc", "fi"))).toEqual(["Öljy", "Äyriäiset", "Zucchini", "Avokado"]);
  });

  test("by Stock, ties by name", () => {
    expect(names(sortProducts(products, "stock", "asc", "fi"))).toEqual(["Zucchini", "Öljy", "Äyriäiset", "Avokado"]);
    expect(names(sortProducts(products, "stock", "desc", "fi"))).toEqual(["Avokado", "Äyriäiset", "Zucchini", "Öljy"]);
  });

  test("by Expiry Date, undated Products last either way, ties by name", () => {
    const dated = [
      product("Maito", 1, "2026-10-20"),
      product("Kahvi", 1),
      product("Jogurtti", 1, "2026-10-17"),
      product("Kerma", 1, "2026-10-20"),
      { ...product("Leipä", 1), expiryDate: "2026-10-16" }, // a date left over without an Expiry Kind
      product("Banaani", 1),
    ];
    expect(names(sortProducts(dated, "expiry", "asc", "fi"))).toEqual([
      "Jogurtti",
      "Kerma",
      "Maito",
      "Banaani",
      "Kahvi",
      "Leipä",
    ]);
    expect(names(sortProducts(dated, "expiry", "desc", "fi"))).toEqual([
      "Kerma",
      "Maito",
      "Jogurtti",
      "Banaani",
      "Kahvi",
      "Leipä",
    ]);
  });
});
