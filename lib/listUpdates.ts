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
type Categories = FunctionReturnType<typeof api.categories.list>;
/** Category groups, then `other`: the to-buy list and the Bag are both shaped like this. */
export type Groups = ShoppingList["bag"];
type Entry = Groups["other"][number];
type ProductEntry = Groups["categories"][number]["entries"][number];

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fi");

/** The Product with this id, in whichever Location it is. */
function findProduct(inventory: Inventory | undefined, productId: Id<"products">) {
  return inventory?.flatMap((location) => location.products).find((p) => p._id === productId);
}

type EntryChange = <E extends Entry>(entry: E) => E;

export function entriesIn(groups: Groups): Entry[] {
  return [...groups.categories.flatMap((category) => category.entries), ...groups.other];
}

/** The groups with `change` made to each of their Entries. */
function changeEntries(groups: Groups, change: EntryChange): Groups {
  return {
    categories: groups.categories.map((category) => ({ ...category, entries: category.entries.map(change) })),
    other: groups.other.map(change),
  };
}

function updateList(store: OptimisticLocalStore, change: (list: ShoppingList) => ShoppingList) {
  const list = store.getQuery(api.shoppingList.get, {});
  if (list) store.setQuery(api.shoppingList.get, {}, change(list));
}

/** Need More: the Product's Entry on the list gets one more, or it goes on the list once. */
export function needMoreLocally(store: OptimisticLocalStore, { productId }: { productId: Id<"products"> }) {
  const product = findProduct(store.getQuery(api.inventory.get, {}), productId);
  if (!product) return;
  const entry = {
    // The server makes the real Entry; until then it goes by its Product.
    _id: `needMore:${productId}` as Id<"entries">,
    productId,
    categoryId: product.categoryId,
    name: product.name,
    quantity: 1,
    stock: product.stock,
    asksForDate: product.expiryKind !== null,
  };
  const categories = store.getQuery(api.categories.list, {});
  updateList(store, (list) => ({ ...(withEntryAdded(list, entry, categories) ?? list), bag: list.bag }));
}

/** How many of a Product are on the list after Need More, for the toast shown at the tap. */
export function quantityAfterNeedMore(list: ShoppingList | undefined, productId: Id<"products">) {
  const entry = list && entriesIn(list).find((e) => "productId" in e && e.productId === productId);
  return (entry?.quantity ?? 0) + 1;
}

/** An Entry's quantity stepper, on the list or in the Bag. */
export function setQuantityLocally(
  store: OptimisticLocalStore,
  { entryId, quantity }: { entryId: Id<"entries">; quantity: number },
) {
  const update: EntryChange = (e) => (e._id === entryId ? { ...e, quantity } : e);
  updateList(store, (list) => ({ ...changeEntries(list, update), bag: changeEntries(list.bag, update) }));
}

/** Ticking an Entry off in the shop: it moves into its group in the Bag. */
export function tickLocally(store: OptimisticLocalStore, { entryId }: { entryId: Id<"entries"> }) {
  const categories = store.getQuery(api.categories.list, {});
  updateList(store, (list) => {
    const ticked = entriesIn(list).find((e) => e._id === entryId);
    const bag = ticked && withEntryPlaced(list.bag, ticked, categories);
    return bag ? { ...withoutEntry(list, entryId), bag } : list;
  });
}

/** Taking an Entry out of the Bag: it goes back on the list. */
export function untickLocally(store: OptimisticLocalStore, { entryId }: { entryId: Id<"entries"> }) {
  const categories = store.getQuery(api.categories.list, {});
  updateList(store, (list) => {
    const entry = entriesIn(list.bag).find((e) => e._id === entryId);
    const listed = entry && withEntryAdded(list, entry, categories);
    return listed ? { ...listed, bag: withoutEntry(list.bag, entryId) } : list;
  });
}

/**
 * Setting a Product's Category: every Entry of it, on the list and in the Bag,
 * moves to that Category's group (or under Other), and Komero and the Product
 * page show the new Category. Needs the Categories for the group's name and
 * place; until they have loaded, nothing changes.
 */
export function setCategoryLocally(
  store: OptimisticLocalStore,
  { productId, categoryId }: { productId: Id<"products">; categoryId?: Id<"categories"> | null },
) {
  const categories = store.getQuery(api.categories.list, {});
  if (categoryId === undefined || !categories) return;
  const move = (groups: Groups) =>
    entriesIn(groups)
      .filter((e): e is ProductEntry => "productId" in e && e.productId === productId)
      .reduce(
        (moved, entry) => withEntryPlaced(withoutEntry(moved, entry._id), { ...entry, categoryId }, categories) ?? moved,
        groups,
      );
  updateList(store, (list) => ({ ...move(list), bag: move(list.bag) }));

  const inventory = store.getQuery(api.inventory.get, {});
  if (inventory) {
    store.setQuery(
      api.inventory.get,
      {},
      inventory.map((location) => ({
        ...location,
        products: location.products.map((p) => (p._id === productId ? { ...p, categoryId } : p)),
      })),
    );
  }
  const page = store.getQuery(api.products.get, { productId });
  if (page) {
    const categoryName = categories.find((c) => c._id === categoryId)?.name ?? null;
    store.setQuery(api.products.get, { productId }, { ...page, categoryId, categoryName });
  }
}

/** Deleting an Entry, wherever it is. */
export function removeLocally(store: OptimisticLocalStore, { entryId }: { entryId: Id<"entries"> }) {
  updateList(store, (list) => ({ ...withoutEntry(list, entryId), bag: withoutEntry(list.bag, entryId) }));
}

/** The groups without an Entry; a Category left with no Entries is left out, as the server does. */
function withoutEntry(groups: Groups, entryId: Id<"entries">): Groups {
  const others = (e: Entry) => e._id !== entryId;
  return {
    categories: groups.categories
      .map((category) => ({ ...category, entries: category.entries.filter(others) }))
      .filter((category) => category.entries.length > 0),
    other: groups.other.filter(others),
  };
}

/**
 * The groups with an Entry added, as the server's `addToList` adds it: its
 * quantity joins the Entry for the same Product or One-off name if there is
 * one; otherwise it is placed by its Category (see `withEntryPlaced`).
 */
function withEntryAdded(groups: Groups, entry: Entry, categories: Categories | undefined) {
  if (!entriesIn(groups).some((e) => same(e, entry))) return withEntryPlaced(groups, entry, categories);
  return changeEntries(groups, (e) => (same(e, entry) ? { ...e, quantity: e.quantity + entry.quantity } : e));
}

/**
 * The groups with an Entry in its Category's group, which is added in
 * Category order if it isn't there yet, or under Other without a Category.
 * Null when its group can't be placed because the Categories haven't loaded.
 */
function withEntryPlaced(groups: Groups, entry: Entry, categories: Categories | undefined): Groups | null {
  if (!("categoryId" in entry) || entry.categoryId === null) {
    return { ...groups, other: [...groups.other, entry].sort(byName) };
  }
  const existing = groups.categories.find((category) => category._id === entry.categoryId);
  const category = existing ?? categories?.find((c) => c._id === entry.categoryId);
  if (!category) return null;
  const group = { _id: category._id, name: category.name, entries: [...(existing?.entries ?? []), entry].sort(byName) };
  const order = (categories ?? groups.categories).map((c) => c._id);
  return {
    categories: [...groups.categories.filter((c) => c !== existing), group].sort(
      (a, b) => order.indexOf(a._id) - order.indexOf(b._id),
    ),
    other: groups.other,
  };
}

/** Put Away of one Entry from the Bag: its Product is Restocked by its quantity, with the date given. */
export function putAwayLocally(
  store: OptimisticLocalStore,
  { entryId, expiryDate }: { entryId: Id<"entries">; expiryDate?: string },
) {
  const bag = store.getQuery(api.shoppingList.get, {})?.bag;
  const entry = bag && entriesIn(bag).find((e) => e._id === entryId);
  if (!entry) return;
  updateList(store, (list) => ({ ...list, bag: withoutEntry(list.bag, entryId) }));
  if ("productId" in entry) {
    changeStockLocally(store, entry.productId, (state) => applyRestock(state, entry.quantity, expiryDate));
  }
}

/** "Put away all": Put Away of every Entry in the Bag, with the dates from the prompts by Product. */
export function putAwayAllLocally(
  store: OptimisticLocalStore,
  { expiryDates = {} }: { expiryDates?: Record<Id<"products">, string> },
) {
  const bag = store.getQuery(api.shoppingList.get, {})?.bag;
  for (const entry of bag ? entriesIn(bag) : []) {
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
  updateList(store, (list) => ({ ...changeEntries(list, withStock), bag: changeEntries(list.bag, withStock) }));
}

/** The same Product, or One-offs with the same name in any case. */
function same(a: Entry, b: Entry) {
  if ("productId" in a || "productId" in b) {
    return "productId" in a && "productId" in b && a.productId === b.productId;
  }
  return nameKey(a.name) === nameKey(b.name);
}
