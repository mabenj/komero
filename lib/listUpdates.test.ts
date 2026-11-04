import type { OptimisticLocalStore } from "convex/browser";
import { type FunctionReference, type FunctionReturnType, getFunctionName } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  needMoreLocally,
  putAwayAllLocally,
  putAwayLocally,
  quantityAfterNeedMore,
  removeLocally,
  setCategoryLocally,
  setOneOffCategoryLocally,
  setQuantityLocally,
  tickLocally,
  untickLocally,
} from "./listUpdates";

type ShoppingList = FunctionReturnType<typeof api.shoppingList.get>;
type Inventory = FunctionReturnType<typeof api.inventory.get>;

/** The Convex client's local query results, as an optimistic update sees them. */
function localStore() {
  const results = new Map<string, { name: string; args: unknown; value: unknown }>();
  const key = (query: FunctionReference<"query">, args: unknown) =>
    `${getFunctionName(query)}:${JSON.stringify(args ?? {})}`;
  const store = {
    getQuery: (query: FunctionReference<"query">, args?: unknown) => results.get(key(query, args))?.value,
    getAllQueries: (query: FunctionReference<"query">) =>
      [...results.values()]
        .filter((result) => result.name === getFunctionName(query))
        .map(({ args, value }) => ({ args, value })),
    setQuery: (query: FunctionReference<"query">, args: unknown, value: unknown) => {
      results.set(key(query, args), { name: getFunctionName(query), args: args ?? {}, value });
    },
  };
  return store as unknown as OptimisticLocalStore;
}

const id = <T extends "entries" | "products" | "locations" | "categories">(value: string) => value as Id<T>;

const fridge = { _id: id<"locations">("fridge"), name: "Jääkaappi" };
const cupboard = { _id: id<"locations">("cupboard"), name: "Kaappi" };

// The household's Categories, in walking order.
const produce = { _id: id<"categories">("produce"), name: "HeVi" };
const dairy = { _id: id<"categories">("dairy"), name: "Maitotuotteet" };
const dry = { _id: id<"categories">("dry"), name: "Kuivatuotteet" };
const categories = [produce, dairy, dry];

const milk = { _id: id<"products">("milk"), name: "Maito", categoryId: dairy._id, stock: 0, expiryKind: "useBy" as const, expiryDate: null, minimumStock: null };
const oats = { _id: id<"products">("oats"), name: "Kaurahiutaleet", categoryId: dry._id, stock: 2, expiryKind: null, expiryDate: null, minimumStock: null };
const inventory: Inventory = [
  { ...fridge, products: [milk] },
  { ...cupboard, products: [oats] },
];

const milkEntry = { _id: id<"entries">("milkEntry"), productId: milk._id, categoryId: dairy._id, name: "Maito", quantity: 2, stock: 0, asksForDate: true };
const oatsEntry = { _id: id<"entries">("oatsEntry"), productId: oats._id, categoryId: dry._id, name: "Kaurahiutaleet", quantity: 1, stock: 2, asksForDate: false };
const candles = { _id: id<"entries">("candles"), name: "Kynttilät", quantity: 1, categoryId: null };

const empty = { categories: [], other: [] };

function withList(list: ShoppingList) {
  const store = localStore();
  store.setQuery(api.inventory.get, {}, inventory);
  store.setQuery(api.categories.list, {}, categories);
  store.setQuery(api.shoppingList.get, {}, list);
  return store;
}
const listIn = (store: OptimisticLocalStore) => store.getQuery(api.shoppingList.get, {});

describe("ticking an Entry", () => {
  test("it moves into its Category's group in the Bag, in Category order, and an emptied group goes", () => {
    const store = withList({
      categories: [{ ...dairy, entries: [milkEntry] }],
      other: [candles],
      bag: { categories: [{ ...dry, entries: [oatsEntry] }], other: [] },
    });

    tickLocally(store, { entryId: milkEntry._id });
    tickLocally(store, { entryId: candles._id });

    expect(listIn(store)).toEqual({
      ...empty,
      bag: {
        categories: [
          { ...dairy, entries: [milkEntry] },
          { ...dry, entries: [oatsEntry] },
        ],
        other: [candles],
      },
    });
  });
});

describe("taking an Entry out of the Bag", () => {
  test("a Product Entry goes back to its Category, in Category order", () => {
    const store = withList({
      categories: [{ ...dry, entries: [oatsEntry] }],
      other: [],
      bag: { categories: [{ ...dairy, entries: [milkEntry] }], other: [] },
    });

    untickLocally(store, { entryId: milkEntry._id });

    expect(listIn(store)).toEqual({
      categories: [
        { ...dairy, entries: [milkEntry] },
        { ...dry, entries: [oatsEntry] },
      ],
      other: [],
      bag: empty,
    });
  });

  test("it joins an Entry for the same Product put on the list meanwhile", () => {
    const again = { ...milkEntry, _id: id<"entries">("again"), quantity: 1 };
    const store = withList({
      categories: [{ ...dairy, entries: [again] }],
      other: [],
      bag: { categories: [{ ...dairy, entries: [milkEntry] }], other: [] },
    });

    untickLocally(store, { entryId: milkEntry._id });

    expect(listIn(store)).toEqual({
      categories: [{ ...dairy, entries: [{ ...again, quantity: 3 }] }],
      other: [],
      bag: empty,
    });
  });

  test("a One-off goes back under Other, joining one with the same name in any case", () => {
    const balloons = { _id: id<"entries">("balloons"), name: "Ilmapallot", quantity: 1, categoryId: null };
    const store = withList({
      categories: [],
      other: [balloons],
      bag: { categories: [], other: [candles, { _id: id<"entries">("more"), name: "ilmapallot", quantity: 2, categoryId: null }] },
    });

    untickLocally(store, { entryId: candles._id });
    untickLocally(store, { entryId: id("more") });

    expect(listIn(store)).toEqual({ categories: [], other: [{ ...balloons, quantity: 3 }, candles], bag: empty });
  });
});

describe("setting a One-off's Category", () => {
  test("it moves from Other into the Category's group, and back under Other when cleared", () => {
    const store = withList({ categories: [{ ...dairy, entries: [milkEntry] }], other: [candles], bag: empty });

    setOneOffCategoryLocally(store, { entryId: candles._id, categoryId: produce._id });
    expect(listIn(store)).toEqual({
      categories: [
        { ...produce, entries: [{ ...candles, categoryId: produce._id }] },
        { ...dairy, entries: [milkEntry] },
      ],
      other: [],
      bag: empty,
    });

    setOneOffCategoryLocally(store, { entryId: candles._id, categoryId: null });
    expect(listIn(store)).toEqual({ categories: [{ ...dairy, entries: [milkEntry] }], other: [candles], bag: empty });
  });
});

describe("setting a Product's Category on Lista", () => {
  test("its Entry moves to the new group, which is made in Category order, and the emptied group goes", () => {
    const store = withList({
      categories: [
        { ...dairy, entries: [milkEntry] },
        { ...dry, entries: [oatsEntry] },
      ],
      other: [candles],
      bag: empty,
    });

    setCategoryLocally(store, { productId: oats._id, categoryId: produce._id });

    expect(listIn(store)).toEqual({
      categories: [
        { ...produce, entries: [{ ...oatsEntry, categoryId: produce._id }] },
        { ...dairy, entries: [milkEntry] },
      ],
      other: [candles],
      bag: empty,
    });
  });

  test("clearing it moves the Entry under Other, and its Entry in the Bag moves too", () => {
    const milkInBag = { ...milkEntry, _id: id<"entries">("milkInBag") };
    const store = withList({
      categories: [{ ...dairy, entries: [milkEntry] }],
      other: [candles],
      bag: { categories: [{ ...dairy, entries: [milkInBag] }], other: [] },
    });

    setCategoryLocally(store, { productId: milk._id, categoryId: null });

    expect(listIn(store)).toEqual({
      categories: [],
      other: [candles, { ...milkEntry, categoryId: null }],
      bag: { categories: [], other: [{ ...milkInBag, categoryId: null }] },
    });
  });

  test("every Entry of the Product moves, and Komero and the Product page show the new Category", () => {
    const milkInBag = { ...milkEntry, _id: id<"entries">("milkInBag") };
    const milkInBagAgain = { ...milkEntry, _id: id<"entries">("milkInBagAgain"), quantity: 1 };
    const store = withList({
      categories: [],
      other: [],
      bag: { categories: [{ ...dairy, entries: [milkInBag, milkInBagAgain] }], other: [] },
    });
    const milkPage = { ...milk, locationId: fridge._id, locationName: fridge.name, categoryName: dairy.name, barcodes: [] };
    store.setQuery(api.products.get, { productId: milk._id }, milkPage);

    setCategoryLocally(store, { productId: milk._id, categoryId: produce._id });

    expect(listIn(store)?.bag).toEqual({
      categories: [
        {
          ...produce,
          entries: [
            { ...milkInBag, categoryId: produce._id },
            { ...milkInBagAgain, categoryId: produce._id },
          ],
        },
      ],
      other: [],
    });
    expect(store.getQuery(api.inventory.get, {})).toEqual([
      { ...fridge, products: [{ ...milk, categoryId: produce._id }] },
      { ...cupboard, products: [oats] },
    ]);
    expect(store.getQuery(api.products.get, { productId: milk._id })).toEqual({
      ...milkPage,
      categoryId: produce._id,
      categoryName: produce.name,
    });
  });

  test("other changes to the Product, or Categories not loaded yet, leave the list as it is", () => {
    const list = { categories: [{ ...dairy, entries: [milkEntry] }], other: [], bag: empty };
    const store = withList(list);

    setCategoryLocally(store, { productId: milk._id });
    expect(listIn(store)).toEqual(list);

    store.setQuery(api.categories.list, {}, undefined);
    setCategoryLocally(store, { productId: milk._id, categoryId: produce._id });
    expect(listIn(store)).toEqual(list);
  });
});

describe("deleting an Entry", () => {
  test("it leaves the list, and a Category left with no Entries goes with it", () => {
    const store = withList({
      categories: [
        { ...dairy, entries: [milkEntry] },
        { ...dry, entries: [oatsEntry] },
      ],
      other: [candles],
      bag: empty,
    });

    removeLocally(store, { entryId: milkEntry._id });
    removeLocally(store, { entryId: candles._id });

    expect(listIn(store)).toEqual({ categories: [{ ...dry, entries: [oatsEntry] }], other: [], bag: empty });
  });
});

describe("changing how many of an Entry to buy", () => {
  test("it changes on the list and in the Bag alike", () => {
    const store = withList({
      categories: [{ ...dry, entries: [oatsEntry] }],
      other: [],
      bag: { categories: [{ ...dairy, entries: [milkEntry] }], other: [candles] },
    });

    setQuantityLocally(store, { entryId: oatsEntry._id, quantity: 3 });
    setQuantityLocally(store, { entryId: milkEntry._id, quantity: 4 });
    setQuantityLocally(store, { entryId: candles._id, quantity: 2 });

    expect(listIn(store)).toEqual({
      categories: [{ ...dry, entries: [{ ...oatsEntry, quantity: 3 }] }],
      other: [],
      bag: { categories: [{ ...dairy, entries: [{ ...milkEntry, quantity: 4 }] }], other: [{ ...candles, quantity: 2 }] },
    });
  });
});

describe("Put Away of one Entry", () => {
  test("it leaves the Bag and Restocks its Product with the date given, wherever the Product is shown", () => {
    const milkToBuy = { ...milkEntry, _id: id<"entries">("milkToBuy"), quantity: 1 };
    const store = withList({
      categories: [{ ...dairy, entries: [milkToBuy] }],
      other: [],
      bag: { categories: [{ ...dairy, entries: [milkEntry] }], other: [candles] },
    });
    const milkPage = {
      ...milk,
      minimumStock: 1,
      locationId: fridge._id,
      locationName: fridge.name,
      categoryName: dairy.name,
      barcodes: [],
    };
    store.setQuery(api.products.get, { productId: milk._id }, milkPage);
    const search = { matches: [{ ...milk, locationName: fridge.name }], canAdd: false, name: "Maito", duplicate: null };
    store.setQuery(api.products.search, { text: "mai" }, search);

    putAwayLocally(store, { entryId: milkEntry._id, expiryDate: "2026-10-20" });

    expect(listIn(store)).toEqual({
      categories: [{ ...dairy, entries: [{ ...milkToBuy, stock: 2 }] }],
      other: [],
      bag: { categories: [], other: [candles] },
    });
    expect(store.getQuery(api.inventory.get, {})).toEqual([
      { ...fridge, products: [{ ...milk, stock: 2, expiryDate: "2026-10-20" }] },
      { ...cupboard, products: [oats] },
    ]);
    expect(store.getQuery(api.products.get, { productId: milk._id })).toEqual({
      ...milkPage,
      stock: 2,
      expiryDate: "2026-10-20",
    });
    expect(store.getQuery(api.products.search, { text: "mai" })?.matches[0].stock).toBe(2);
  });

  test("a One-off just leaves the Bag", () => {
    const store = withList({ ...empty, bag: { categories: [], other: [candles] } });

    putAwayLocally(store, { entryId: candles._id });

    expect(listIn(store)).toEqual({ ...empty, bag: empty });
  });
});

describe("Need More", () => {
  test("a Product already on the list gets one more, even while it is also in the Bag", () => {
    const list = {
      categories: [{ ...dry, entries: [oatsEntry] }],
      other: [],
      bag: { categories: [{ ...dairy, entries: [milkEntry] }], other: [] },
    };
    const store = withList(list);

    expect(quantityAfterNeedMore(list, oats._id)).toBe(2);
    needMoreLocally(store, { productId: oats._id });

    expect(listIn(store)).toEqual({ ...list, categories: [{ ...dry, entries: [{ ...oatsEntry, quantity: 2 }] }] });
  });

  test("a Product not on the list goes in its Category, once, with its Stock at home", () => {
    const list = {
      categories: [{ ...dry, entries: [oatsEntry] }],
      other: [],
      bag: { categories: [{ ...dairy, entries: [milkEntry] }], other: [] },
    };
    const store = withList(list);

    expect(quantityAfterNeedMore(list, milk._id)).toBe(1);
    needMoreLocally(store, { productId: milk._id });

    expect(listIn(store)).toEqual({
      ...list,
      categories: [
        {
          ...dairy,
          entries: [
            {
              _id: expect.any(String),
              productId: milk._id,
              categoryId: dairy._id,
              name: "Maito",
              quantity: 1,
              stock: 0,
              asksForDate: true,
            },
          ],
        },
        { ...dry, entries: [oatsEntry] },
      ],
    });
  });

  test("a Product without a Category goes under Other, and counts there", () => {
    const soap = { ...oats, _id: id<"products">("soap"), name: "Saippua", categoryId: null };
    const store = withList({ ...empty, bag: empty });
    store.setQuery(api.inventory.get, {}, [{ ...cupboard, products: [soap] }]);

    needMoreLocally(store, { productId: soap._id });

    expect(listIn(store)?.other.map((e) => [e.name, e.quantity])).toEqual([["Saippua", 1]]);
    expect(quantityAfterNeedMore(listIn(store), soap._id)).toBe(2);
  });
});

describe("Put away all", () => {
  test("the grouped Bag empties and each Product is Restocked with its own date, keeping an earlier one at home", () => {
    const yoghurt = { _id: id<"products">("yoghurt"), name: "Jogurtti", categoryId: dairy._id, stock: 1, expiryKind: "bestBefore" as const, expiryDate: "2026-10-18", minimumStock: null };
    const yoghurtEntry = { _id: id<"entries">("yoghurtEntry"), productId: yoghurt._id, categoryId: dairy._id, name: "Jogurtti", quantity: 3, stock: 1, asksForDate: true };
    const store = withList({
      ...empty,
      bag: {
        categories: [
          { ...dairy, entries: [yoghurtEntry, milkEntry] },
          { ...dry, entries: [oatsEntry] },
        ],
        other: [candles],
      },
    });
    store.setQuery(api.inventory.get, {}, [
      { ...fridge, products: [yoghurt, milk] },
      { ...cupboard, products: [oats] },
    ]);

    putAwayAllLocally(store, { expiryDates: { [milk._id]: "2026-10-20", [yoghurt._id]: "2026-10-25" } });

    expect(listIn(store)).toEqual({ ...empty, bag: empty });
    expect(store.getQuery(api.inventory.get, {})).toEqual([
      {
        ...fridge,
        products: [
          { ...yoghurt, stock: 4, expiryDate: "2026-10-18" },
          { ...milk, stock: 2, expiryDate: "2026-10-20" },
        ],
      },
      { ...cupboard, products: [{ ...oats, stock: 3 }] },
    ]);
  });
});
