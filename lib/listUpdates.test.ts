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

const id = <T extends "entries" | "products" | "locations">(value: string) => value as Id<T>;

const fridge = { _id: id<"locations">("fridge"), name: "Jääkaappi" };
const cupboard = { _id: id<"locations">("cupboard"), name: "Kaappi" };

const milk = { _id: id<"products">("milk"), name: "Maito", stock: 0, expiryKind: "useBy" as const, expiryDate: null };
const oats = { _id: id<"products">("oats"), name: "Kaurahiutaleet", stock: 2, expiryKind: null, expiryDate: null };
const inventory: Inventory = [
  { ...fridge, products: [milk] },
  { ...cupboard, products: [oats] },
];

const milkEntry = { _id: id<"entries">("milkEntry"), productId: milk._id, name: "Maito", quantity: 2, stock: 0, asksForDate: true };
const oatsEntry = { _id: id<"entries">("oatsEntry"), productId: oats._id, name: "Kaurahiutaleet", quantity: 1, stock: 2, asksForDate: false };
const candles = { _id: id<"entries">("candles"), name: "Kynttilät", quantity: 1 };

function withList(list: ShoppingList) {
  const store = localStore();
  store.setQuery(api.inventory.get, {}, inventory);
  store.setQuery(api.shoppingList.get, {}, list);
  return store;
}
const listIn = (store: OptimisticLocalStore) => store.getQuery(api.shoppingList.get, {});

describe("taking an Entry out of the Bag", () => {
  test("a Product Entry goes back to its Location, in Location order", () => {
    const store = withList({
      locations: [{ ...cupboard, entries: [oatsEntry] }],
      oneOffs: [],
      bag: [milkEntry],
    });

    untickLocally(store, { entryId: milkEntry._id });

    expect(listIn(store)).toEqual({
      locations: [
        { ...fridge, entries: [milkEntry] },
        { ...cupboard, entries: [oatsEntry] },
      ],
      oneOffs: [],
      bag: [],
    });
  });

  test("it joins an Entry for the same Product put on the list meanwhile", () => {
    const again = { ...milkEntry, _id: id<"entries">("again"), quantity: 1 };
    const store = withList({ locations: [{ ...fridge, entries: [again] }], oneOffs: [], bag: [milkEntry] });

    untickLocally(store, { entryId: milkEntry._id });

    expect(listIn(store)).toEqual({
      locations: [{ ...fridge, entries: [{ ...again, quantity: 3 }] }],
      oneOffs: [],
      bag: [],
    });
  });

  test("a One-off goes back among the One-offs, joining one with the same name in any case", () => {
    const balloons = { _id: id<"entries">("balloons"), name: "Ilmapallot", quantity: 1 };
    const store = withList({
      locations: [],
      oneOffs: [balloons],
      bag: [candles, { _id: id<"entries">("more"), name: "ilmapallot", quantity: 2 }],
    });

    untickLocally(store, { entryId: candles._id });
    untickLocally(store, { entryId: id("more") });

    expect(listIn(store)).toEqual({ locations: [], oneOffs: [{ ...balloons, quantity: 3 }, candles], bag: [] });
  });
});

describe("deleting an Entry", () => {
  test("it leaves the list, and a Location left with no Entries goes with it", () => {
    const store = withList({
      locations: [
        { ...fridge, entries: [milkEntry] },
        { ...cupboard, entries: [oatsEntry] },
      ],
      oneOffs: [candles],
      bag: [],
    });

    removeLocally(store, { entryId: milkEntry._id });
    removeLocally(store, { entryId: candles._id });

    expect(listIn(store)).toEqual({ locations: [{ ...cupboard, entries: [oatsEntry] }], oneOffs: [], bag: [] });
  });
});

describe("Put Away of one Entry", () => {
  test("it leaves the Bag and Restocks its Product with the date given, wherever the Product is shown", () => {
    const milkToBuy = { ...milkEntry, _id: id<"entries">("milkToBuy"), quantity: 1 };
    const store = withList({ locations: [{ ...fridge, entries: [milkToBuy] }], oneOffs: [], bag: [milkEntry, candles] });
    const milkPage = { ...milk, minimumStock: 1, locationId: fridge._id, locationName: fridge.name, barcodes: [] };
    store.setQuery(api.products.get, { productId: milk._id }, milkPage);
    const search = { matches: [{ ...milk, locationName: fridge.name }], canAdd: false, name: "Maito", duplicate: null };
    store.setQuery(api.products.search, { text: "mai" }, search);

    putAwayLocally(store, { entryId: milkEntry._id, expiryDate: "2026-10-20" });

    expect(listIn(store)).toEqual({
      locations: [{ ...fridge, entries: [{ ...milkToBuy, stock: 2 }] }],
      oneOffs: [],
      bag: [candles],
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
    const store = withList({ locations: [], oneOffs: [], bag: [candles] });

    putAwayLocally(store, { entryId: candles._id });

    expect(listIn(store)).toEqual({ locations: [], oneOffs: [], bag: [] });
  });
});

describe("Need More", () => {
  test("a Product already on the list gets one more, even while it is also in the Bag", () => {
    const list = { locations: [{ ...cupboard, entries: [oatsEntry] }], oneOffs: [], bag: [milkEntry] };
    const store = withList(list);

    expect(quantityAfterNeedMore(list, oats._id)).toBe(2);
    needMoreLocally(store, { productId: oats._id });

    expect(listIn(store)).toEqual({ ...list, locations: [{ ...cupboard, entries: [{ ...oatsEntry, quantity: 2 }] }] });
  });

  test("a Product not on the list goes in its Location, once, with its Stock at home", () => {
    const list = { locations: [{ ...cupboard, entries: [oatsEntry] }], oneOffs: [], bag: [milkEntry] };
    const store = withList(list);

    expect(quantityAfterNeedMore(list, milk._id)).toBe(1);
    needMoreLocally(store, { productId: milk._id });

    expect(listIn(store)).toEqual({
      ...list,
      locations: [
        { ...fridge, entries: [{ _id: expect.any(String), productId: milk._id, name: "Maito", quantity: 1, stock: 0, asksForDate: true }] },
        { ...cupboard, entries: [oatsEntry] },
      ],
    });
  });
});

describe("Put away all", () => {
  test("the Bag empties and each Product is Restocked with its own date, keeping an earlier one at home", () => {
    const yoghurt = { _id: id<"products">("yoghurt"), name: "Jogurtti", stock: 1, expiryKind: "bestBefore" as const, expiryDate: "2026-10-18" };
    const yoghurtEntry = { _id: id<"entries">("yoghurtEntry"), productId: yoghurt._id, name: "Jogurtti", quantity: 3, stock: 1, asksForDate: true };
    const store = withList({ locations: [], oneOffs: [], bag: [yoghurtEntry, candles, oatsEntry, milkEntry] });
    store.setQuery(api.inventory.get, {}, [
      { ...fridge, products: [yoghurt, milk] },
      { ...cupboard, products: [oats] },
    ]);

    putAwayAllLocally(store, { expiryDates: { [milk._id]: "2026-10-20", [yoghurt._id]: "2026-10-25" } });

    expect(listIn(store)).toEqual({ locations: [], oneOffs: [], bag: [] });
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
