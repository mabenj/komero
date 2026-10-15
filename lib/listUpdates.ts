// Optimistic updates for the Shopping List and Stock: the change each mutation
// makes on the server, applied at once to the query results already on the
// phone, so every action shows immediately, even offline (ADR-0001). Convex
// replaces them with the server's results when the mutation completes.
// Relative imports, so Vitest can run this without the app's path alias.
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { nameKey } from "../convex/productNames";
import { applyRestock, type StockState } from "../convex/stock";

type ShoppingList = FunctionReturnType<typeof api.shoppingList.get>;
type Inventory = FunctionReturnType<typeof api.inventory.get>;
type Entry = ShoppingList["bag"][number];

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fi");

/** The Product with this id, in whichever Location it is. */
function findProduct(inventory: Inventory | undefined, productId: Id<"products">) {
  return inventory?.flatMap((location) => location.products).find((p) => p._id === productId);
}

type EntryChange = <E extends Entry>(entry: E) => E;

/** The list's Location groups, with `change` made to each of their Entries. */
function changeInLocations(list: ShoppingList, change: EntryChange) {
  return list.locations.map((location) => ({ ...location, entries: location.entries.map(change) }));
}

function updateList(store: OptimisticLocalStore, change: (list: ShoppingList) => ShoppingList) {
  const list = store.getQuery(api.shoppingList.get, {});
  if (list) store.setQuery(api.shoppingList.get, {}, change(list));
}

/** Need More: the Product's Entry on the list gets one more, or it goes on the list once. */
export function needMoreLocally(store: OptimisticLocalStore, { productId }: { productId: Id<"products"> }) {
  const inventory = store.getQuery(api.inventory.get, {});
  const product = findProduct(inventory, productId);
  if (!product) return;
  const entry = {
    // The server makes the real Entry; until then it goes by its Product.
    _id: `needMore:${productId}` as Id<"entries">,
    productId,
    name: product.name,
    quantity: 1,
    stock: product.stock,
    asksForDate: product.expiryKind !== null,
  };
  updateList(store, (list) => withEntryAdded(list, entry, inventory));
}

/** How many of a Product are on the list after Need More, for the toast shown at the tap. */
export function quantityAfterNeedMore(list: ShoppingList | undefined, productId: Id<"products">) {
  const entry = list?.locations.flatMap((location) => location.entries).find((e) => e.productId === productId);
  return (entry?.quantity ?? 0) + 1;
}

/** An Entry's quantity stepper, on the list (the Bag has none). */
export function setQuantityLocally(
  store: OptimisticLocalStore,
  { entryId, quantity }: { entryId: Id<"entries">; quantity: number },
) {
  const update: EntryChange = (e) => (e._id === entryId ? { ...e, quantity } : e);
  updateList(store, (list) => ({
    locations: changeInLocations(list, update),
    oneOffs: list.oneOffs.map(update),
    bag: list.bag,
  }));
}

/** Ticking an Entry off in the shop: it moves to the Bag. */
export function tickLocally(store: OptimisticLocalStore, { entryId }: { entryId: Id<"entries"> }) {
  updateList(store, (list) => {
    const ticked = [...list.locations.flatMap((location) => location.entries), ...list.oneOffs].find(
      (e) => e._id === entryId,
    );
    if (!ticked) return list;
    const rest = withoutEntry(list, entryId);
    return { ...rest, bag: [...rest.bag, ticked].sort(byName) };
  });
}

/** Deleting an Entry, wherever it is. */
export function removeLocally(store: OptimisticLocalStore, { entryId }: { entryId: Id<"entries"> }) {
  updateList(store, (list) => withoutEntry(list, entryId));
}

/** The list without an Entry; a Location left with no Entries is left out, as the server does. */
function withoutEntry(list: ShoppingList, entryId: Id<"entries">): ShoppingList {
  const others = (e: Entry) => e._id !== entryId;
  return {
    locations: list.locations
      .map((location) => ({ ...location, entries: location.entries.filter(others) }))
      .filter((location) => location.entries.length > 0),
    oneOffs: list.oneOffs.filter(others),
    bag: list.bag.filter(others),
  };
}

/** Taking an Entry out of the Bag: it goes back on the list. */
export function untickLocally(store: OptimisticLocalStore, { entryId }: { entryId: Id<"entries"> }) {
  const inventory = store.getQuery(api.inventory.get, {});
  updateList(store, (list) => {
    const entry = list.bag.find((e) => e._id === entryId);
    if (!entry) return list;
    return withEntryAdded({ ...list, bag: list.bag.filter((e) => e !== entry) }, entry, inventory);
  });
}

/**
 * The list with an Entry added, as the server's `addToList` adds it: its quantity
 * joins the Entry for the same Product or One-off name if there is one;
 * otherwise it goes in its Product's Home Location group, or among the One-offs.
 */
function withEntryAdded(list: ShoppingList, entry: Entry, inventory: Inventory | undefined): ShoppingList {
  const join: EntryChange = (e) => (same(e, entry) ? { ...e, quantity: e.quantity + entry.quantity } : e);
  if (!("productId" in entry)) {
    return list.oneOffs.some((e) => same(e, entry))
      ? { ...list, oneOffs: list.oneOffs.map(join) }
      : { ...list, oneOffs: [...list.oneOffs, entry].sort(byName) };
  }
  if (list.locations.some((location) => location.entries.some((e) => same(e, entry)))) {
    return { ...list, locations: changeInLocations(list, join) };
  }
  const home = inventory?.find((location) => location.products.some((p) => p._id === entry.productId));
  if (!inventory || !home) return list;
  const group = list.locations.find((location) => location._id === home._id) ?? {
    _id: home._id,
    name: home.name,
    entries: [],
  };
  const order = inventory.map((location) => location._id);
  return {
    ...list,
    locations: [
      ...list.locations.filter((location) => location !== group),
      { ...group, entries: [...group.entries, entry].sort(byName) },
    ].sort((a, b) => order.indexOf(a._id) - order.indexOf(b._id)),
  };
}

/** Put Away of one Entry from the Bag: its Product is Restocked by its quantity, with the date given. */
export function putAwayLocally(
  store: OptimisticLocalStore,
  { entryId, expiryDate }: { entryId: Id<"entries">; expiryDate?: string },
) {
  const entry = store.getQuery(api.shoppingList.get, {})?.bag.find((e) => e._id === entryId);
  if (!entry) return;
  updateList(store, (list) => withoutEntry(list, entryId));
  if ("productId" in entry) {
    changeStockLocally(store, entry.productId, (state) => applyRestock(state, entry.quantity, expiryDate));
  }
}

/** "Put away all": Put Away of every Entry in the Bag, with the dates from the prompts by Product. */
export function putAwayAllLocally(
  store: OptimisticLocalStore,
  { expiryDates = {} }: { expiryDates?: Record<Id<"products">, string> },
) {
  for (const entry of store.getQuery(api.shoppingList.get, {})?.bag ?? []) {
    const expiryDate = "productId" in entry ? expiryDates[entry.productId] : undefined;
    putAwayLocally(store, { entryId: entry._id, expiryDate });
  }
}

/**
 * Applies one of the shared Stock rules (convex/stock.ts) to a Product, and
 * shows its new Stock and Expiry Date everywhere the Product is shown.
 */
export function changeStockLocally(
  store: OptimisticLocalStore,
  productId: Id<"products">,
  rule: (state: StockState) => StockState,
) {
  const inventory = store.getQuery(api.inventory.get, {});
  const page = store.getQuery(api.products.get, { productId });
  const product = findProduct(inventory, productId) ?? page;
  if (!product) return;
  const next = rule({
    stock: product.stock,
    expiryKind: product.expiryKind ?? undefined,
    expiryDate: product.expiryDate ?? undefined,
  });
  const stock = next.stock;
  const expiryDate = next.expiryDate ?? null;

  if (inventory) {
    store.setQuery(
      api.inventory.get,
      {},
      inventory.map((location) => ({
        ...location,
        products: location.products.map((p) => (p._id === productId ? { ...p, stock, expiryDate } : p)),
      })),
    );
  }
  if (page) store.setQuery(api.products.get, { productId }, { ...page, stock, expiryDate });
  for (const { args, value } of store.getAllQueries(api.products.search)) {
    if (!value) continue;
    const matches = value.matches.map((p) => (p._id === productId ? { ...p, stock } : p));
    store.setQuery(api.products.search, args, { ...value, matches });
  }
  const withStock: EntryChange = (e) => ("productId" in e && e.productId === productId ? { ...e, stock } : e);
  updateList(store, (list) => ({
    locations: changeInLocations(list, withStock),
    oneOffs: list.oneOffs,
    bag: list.bag.map(withStock),
  }));
}

/** The same Product, or One-offs with the same name in any case. */
function same(a: Entry, b: Entry) {
  if ("productId" in a || "productId" in b) {
    return "productId" in a && "productId" in b && a.productId === b.productId;
  }
  return nameKey(a.name) === nameKey(b.name);
}
