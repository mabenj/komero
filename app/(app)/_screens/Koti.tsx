"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { AppLink, navigate } from "@/components/AppLink";
import { CategorySelect } from "@/components/CategorySelect";
import { Combobox, type ComboboxOption, useProductSearch } from "@/components/Combobox";
import { CupboardNote } from "@/components/Cupboard";
import { ExpiryKindSelect } from "@/components/ExpiryKindSelect";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useChangeToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChevronDownIcon, ScanIcon } from "@/components/icons";
import { Fold, settle, useLayoutMotion } from "@/components/motion";
import { NeedsAttention, statusText } from "@/components/NeedsAttention";
import { SwipeToNeedMore } from "@/components/NeedMore";
import { NumberStepper } from "@/components/NumberStepper";
import { Sheet } from "@/components/Sheet";
import { useRunningLowToast, useUndoStockChange } from "@/components/StockToasts";
import { nameKey, tidyName } from "@/convex/productNames";
import {
  applyRestock,
  applyUse,
  type ExpiryKind,
  expiryStatus,
  isRunningLow,
  type StockState,
} from "@/convex/stock";
import { localToday, relativeExpiry } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";
import { changeStockLocally } from "@/lib/listUpdates";
import { foldedLocations, lastLocation, rememberFoldedLocations, rememberLocation } from "@/lib/remembered";
import { type SortColumn, type SortDirection, sortProducts } from "@/lib/sortProducts";
import { cardList, field, primaryButton } from "@/lib/styles";

type StockChange = "restock" | "use";

const sheetField = `${field} w-full px-3`;
type Location = { _id: Id<"locations">; name: string };
type Sort = { column: SortColumn; direction: SortDirection };
type ProductRowData = {
  _id: Id<"products">;
  name: string;
  stock: number;
  expiryKind?: ExpiryKind | null;
  expiryDate?: string | null;
  minimumStock?: number | null;
};

/** Running Low but not yet Out of Stock, which rows already show. */
const lowNotOut = (product: ProductRowData) =>
  product.stock > 0 && isRunningLow({ stock: product.stock, minimumStock: product.minimumStock ?? undefined });

export default function KotiScreen() {
  const t = useT();
  const inventory = useQuery(api.inventory.get);
  const locationInView = useLocationInView(inventory !== undefined);
  const changeStock = useStockChange();
  const [searchText, setSearchText] = useState("");
  const [adding, setAdding] = useState<{ name: string; locationId: Id<"locations"> } | null>(null);
  const justAdded = useJustAdded();
  const [folded, toggleFolded, unfold] = useFoldedLocations();
  // One sort for every Location; it starts by name each time Koti opens.
  const [sort, setSort] = useState<Sort>({ column: "name", direction: "asc" });
  const sortBy = (column: SortColumn) =>
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === "asc" ? "desc" : "asc",
    }));
  const layout = useLayoutMotion();

  if (inventory === undefined) return <p className="text-stone-500">{t("common.loading")}</p>;

  const empty = inventory.every((location) => location.products.length === 0);
  // One layout group, so a part that opens moves the Locations below it smoothly; table rows themselves stay still.
  return (
    <LayoutGroup>
      <div className="flex flex-col gap-6">
        <SearchAdd
          text={searchText}
          onTextChange={setSearchText}
          locations={inventory}
          locationInView={locationInView}
          onAdd={(name, locationId) => setAdding({ name, locationId })}
        />
        {empty ? <EmptyKoti /> : <NeedsAttention />}
        {inventory.map((location) => (
          <motion.section
            key={location._id}
            layout={layout}
            data-location-id={location._id}
            className="flex flex-col"
          >
            <div className="flex items-center gap-2 px-1">
              {/* The heading fills the row up to Add, so a tap anywhere beside it folds. */}
              <h2 className="flex-1">
                <button
                  type="button"
                  aria-expanded={!folded.has(location._id)}
                  aria-controls={`products-${location._id}`}
                  onClick={() => toggleFolded(location._id)}
                  className="flex min-h-11 w-full items-center gap-1.5 text-left"
                >
                  <motion.span
                    animate={{ rotate: folded.has(location._id) ? -90 : 0 }}
                    transition={settle}
                    className="flex text-stone-400"
                  >
                    <ChevronDownIcon width={16} height={16} />
                  </motion.span>
                  <span className="flex items-center gap-2">
                    <span className="font-display text-lg">{location.name}</span>
                    <span className="text-xs font-semibold text-stone-400 tabular-nums">
                      {location.products.length}
                    </span>
                    <LowCount products={location.products} />
                  </span>
                </button>
              </h2>
              <button
                type="button"
                // Opening synchronously inside the tap lets the sheet focus Name, so phones show the keyboard.
                onClick={() => flushSync(() => setAdding({ name: "", locationId: location._id }))}
                aria-label={t("koti.addHereLabel", { location: location.name })}
                className="min-h-11 rounded-full px-3 text-sm font-medium text-stone-600 dark:text-stone-400"
              >
                {t("koti.addHere")}
              </button>
            </div>
            <AnimatePresence initial={false}>
              {folded.has(location._id) ? (
                location.products.length > 0 && (
                  <Fold key="names">
                    <p className="truncate pt-0.5 pr-1 pl-[26px] text-sm text-stone-500">
                      {location.products.map((product) => product.name).join(", ")}
                    </p>
                  </Fold>
                )
              ) : (
                <Fold key="products" id={`products-${location._id}`}>
                  <div className="pt-1.5">
                    {location.products.length > 0 ? (
                      <ProductTable
                        label={location.name}
                        products={location.products}
                        sort={sort}
                        onSort={sortBy}
                        onChangeStock={changeStock}
                        justAdded={justAdded.id}
                      />
                    ) : (
                      !empty && (
                        <p className={`${cardList} px-4 py-3 text-sm text-stone-500`}>{t("koti.noProducts")}</p>
                      )
                    )}
                  </div>
                </Fold>
              )}
            </AnimatePresence>
          </motion.section>
        ))}
      </div>
      <AnimatePresence>
        {adding && (
          <AddSheet
            key="add"
            initialName={adding.name}
            locations={inventory}
            initialLocationId={adding.locationId}
            onClose={() => setAdding(null)}
            onSubmitted={() => {
              // A name came with the sheet only from the search field, which clears for the next search.
              if (adding.name !== "") setSearchText("");
              setAdding(null);
            }}
            onCreated={(productId, locationId) => {
              unfold(locationId);
              justAdded.set(productId);
            }}
            onFailed={(name) => setSearchText((current) => current || name)}
          />
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}

/** How many of a Location's Products are Running Low, in the heading; nothing when none are. */
function LowCount({ products }: { products: ProductRowData[] }) {
  const t = useT();
  const count = products.filter(lowNotOut).length;
  if (count === 0) return null;
  return (
    <span className={`text-xs font-semibold tabular-nums ${statusText.runningLow}`}>
      {t("koti.lowCount", { count })}
    </span>
  );
}

/** The search/add field: matching Products to open as you type, or "+ Add" for a new one. */
function SearchAdd({
  text,
  onTextChange: setText,
  locations,
  locationInView,
  onAdd,
}: {
  text: string;
  onTextChange: (text: string) => void;
  locations: (Location & { products: ProductRowData[] })[];
  locationInView: Id<"locations"> | null;
  onAdd: (name: string, locationId: Id<"locations">) => void;
}) {
  const t = useT();
  const result = useProductSearch(text);
  const name = tidyName(text);
  const matches = result?.matches ?? [];
  // From the matches, not the answer's own `canAdd`, which may still be for the text before.
  const exists = matches.some((match) => nameKey(match.name) === nameKey(name));

  const remembered = locations.find((location) => location._id === lastLocation())?._id;
  const locationId = locationInView ?? remembered ?? locations[0]?._id;

  const options: ComboboxOption[] = matches.map((match) => ({
    key: match._id,
    label: match.name,
    detail: `${match.locationName} · ${t("lista.stock", { stock: match.stock })}`,
    onPick: () => {
      setText("");
      navigate(`/koti/${match._id}`);
    },
  }));
  if (name !== "" && !exists && locationId) {
    const duplicate = result?.duplicate;
    options.push({
      key: "add",
      label: t("koti.add", { name }),
      detail: duplicate && t("koti.similar", { name: duplicate.name, location: duplicate.locationName }),
      add: true,
      onPick: () => onAdd(name, locationId),
    });
  }

  return <Combobox value={text} onChange={setText} label={t("koti.search")} options={options} />;
}

const isPackages = (n: number) => Number.isInteger(n) && n >= 0;

/**
 * "Add a Product": its name, Location, Category, Stock (1 unless changed),
 * Minimum Stock, Expiry Kind, and an Expiry Date once it has a kind and Stock.
 */
function AddSheet({
  initialName,
  locations,
  initialLocationId,
  onClose,
  onSubmitted,
  onCreated,
  onFailed,
}: {
  initialName: string;
  locations: Location[];
  initialLocationId: Id<"locations">;
  onClose: () => void;
  onSubmitted: () => void;
  onCreated: (productId: Id<"products">, locationId: Id<"locations">) => void;
  onFailed: (name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const [locationId, setLocationId] = useState(initialLocationId);
  const [categoryId, setCategoryId] = useState<Id<"categories"> | null>(null);
  const [stockText, setStockText] = useState("1");
  const [minimumStockText, setMinimumStockText] = useState("");
  const [expiryKind, setExpiryKind] = useState<ExpiryKind | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const duplicate = useProductSearch(name)?.duplicate;
  const createProduct = useMutation(api.products.create);

  const stock = Number(stockText);
  const minimumStock = minimumStockText.trim() === "" ? undefined : Number(minimumStockText);
  const valid =
    tidyName(name) !== "" &&
    stockText.trim() !== "" &&
    isPackages(stock) &&
    (minimumStock === undefined || isPackages(minimumStock));
  // An Out of Stock Product has no Expiry Date, so the date shows only with Stock.
  const showsExpiryDate = expiryKind !== null && stock > 0;

  // A name that already exists can still be added, next to its warning.
  // The sheet closes at once; the name comes back in the search field if adding fails.
  const add = () => {
    if (!valid) return;
    const tidy = tidyName(name);
    rememberLocation(locationId);
    onSubmitted();
    createProduct({
      name: tidy,
      locationId,
      categoryId: categoryId ?? undefined,
      stock,
      minimumStock,
      expiryKind: expiryKind ?? undefined,
      expiryDate: showsExpiryDate && expiryDate ? expiryDate : undefined,
    }).then((productId) => onCreated(productId, locationId), () => onFailed(tidy));
  };

  return (
    <Sheet title={t("koti.addTitle")} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-stone-500">{t("product.name")}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            enterKeyHint="done"
            autoComplete="off"
            className={sheetField}
          />
        </label>
        {duplicate && <DuplicateWarning duplicate={duplicate} />}
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-stone-500">{t("koti.addTo")}</span>
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value as Id<"locations">)}
              className={sheetField}
            >
              {locations.map((location) => (
                <option key={location._id} value={location._id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-stone-500">{t("product.category")}</span>
            <CategorySelect value={categoryId} onChange={setCategoryId} className={sheetField} />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-stone-500">{t("product.stock")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={stockText}
              onChange={(event) => setStockText(event.target.value)}
              className={sheetField}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-stone-500">{t("product.minimumStock")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={minimumStockText}
              onChange={(event) => setMinimumStockText(event.target.value)}
              placeholder={t("product.minimumStockNone")}
              className={sheetField}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-stone-500">{t("product.expiryKind")}</span>
            <ExpiryKindSelect value={expiryKind} onChange={setExpiryKind} className={sheetField} />
          </label>
          {showsExpiryDate && (
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-stone-500">{t("product.expiryDate")}</span>
              <input
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                className={sheetField}
              />
            </label>
          )}
        </div>
        <button type="submit" disabled={!valid} className={`${primaryButton} mt-1 min-h-12 px-4`}>
          {t("koti.addButton")}
        </button>
      </form>
    </Sheet>
  );
}

/** The first visit: the cupboard opens its doors and invites the first Product. */
function EmptyKoti() {
  const t = useT();
  return (
    <CupboardNote title={t("koti.emptyTitle")} hint={t("koti.emptyHint")}>
      <AppLink
        href="/scan"
        className="mt-1 flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-accent-foreground"
      >
        <ScanIcon width={20} height={20} />
        {t("nav.scan")}
      </AppLink>
    </CupboardNote>
  );
}

function DuplicateWarning({ duplicate }: { duplicate: { name: string; locationName: string } }) {
  const t = useT();
  return (
    <p className="rounded-sm bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
      {t("koti.duplicate", { name: duplicate.name, location: duplicate.locationName })}
    </p>
  );
}

const tableRow = "flex items-center gap-2 px-4";
const columns: SortColumn[] = ["name", "expiry", "stock"];
// Fixed widths, so the columns line up across Locations; Stock grows while its stepper is open.
const cellWidths: Record<SortColumn, string> = {
  name: "min-w-0 flex-1",
  expiry: "w-24 shrink-0 truncate",
  stock: "flex min-w-16 shrink-0 justify-end",
};

/**
 * A Location's Products as a table: Name · Expiry Date · Stock. Tapping a
 * column header sorts every Location by it, and again reverses the order.
 * On phones it runs edge to edge.
 */
function ProductTable({
  label,
  products,
  sort,
  onSort,
  onChangeStock,
  justAdded,
}: {
  label: string;
  products: ProductRowData[];
  sort: Sort;
  onSort: (column: SortColumn) => void;
  onChangeStock: (product: ProductRowData, change: StockChange) => void;
  justAdded: Id<"products"> | null;
}) {
  const t = useT();
  const lang = useLang();
  return (
    <div
      role="table"
      aria-label={label}
      className={`${cardList} overflow-hidden max-sm:-mx-4 max-sm:rounded-none max-sm:shadow-none`}
    >
      <div role="row" className={`${tableRow} min-h-9 text-xs font-semibold text-stone-500`}>
        {columns.map((column) => {
          const sorted = sort.column === column;
          return (
            <div
              key={column}
              role="columnheader"
              aria-sort={sorted ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
              className={cellWidths[column]}
            >
              <button type="button" onClick={() => onSort(column)} className="-my-1 flex min-h-11 items-center gap-0.5">
                {t(`koti.column.${column}`)}
                {sorted && <span aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</span>}
              </button>
            </div>
          );
        })}
      </div>
      {sortProducts(products, sort.column, sort.direction, lang).map((product) => (
        <ProductRow
          key={product._id}
          product={product}
          onChangeStock={onChangeStock}
          justAdded={product._id === justAdded}
        />
      ))}
    </div>
  );
}

const dimmedName = "text-stone-400 dark:text-stone-500";

/**
 * A Product in its Location's table: its name, how far off its Expiry Date is,
 * and its Stock as a number that opens – / +; swipe it left for Need More.
 * Out of Stock Products stay listed, dimmed. A Product just added scrolls into
 * view and flashes.
 */
function ProductRow({
  product,
  onChangeStock,
  justAdded,
}: {
  product: ProductRowData;
  onChangeStock: (product: ProductRowData, change: StockChange) => void;
  justAdded: boolean;
}) {
  const nameCell = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (justAdded) nameCell.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [justAdded, reduced]);

  return (
    <SwipeToNeedMore
      product={product}
      role="row"
      className={`${tableRow} min-h-9 text-sm ${justAdded ? "just-added" : ""}`}
    >
      {/* Clear of the top bar and the bottom tab bar when scrolled into view. */}
      <div ref={nameCell} role="cell" className={`${cellWidths.name} scroll-mt-20 scroll-mb-28`}>
        <AppLink
          href={`/koti/${product._id}`}
          className={`-my-1 flex min-h-11 items-center ${product.stock === 0 ? dimmedName : ""}`}
        >
          <span className="truncate">{product.name}</span>
        </AppLink>
      </div>
      <div role="cell" className={cellWidths.expiry}>
        <ExpiryDate product={product} />
      </div>
      <div role="cell" className={cellWidths.stock}>
        <StockStepper product={product} onChangeStock={onChangeStock} />
      </div>
    </SwipeToNeedMore>
  );
}

/** How far off a Product's Expiry Date is, coloured by what it means today; nothing without one. */
function ExpiryDate({ product }: { product: ProductRowData }) {
  const lang = useLang();
  const { expiryKind, expiryDate } = product;
  if (!expiryKind || !expiryDate) return null;
  const today = localToday();
  const status = expiryStatus({ stock: 1, expiryKind, expiryDate }, today);
  return (
    <span className={`shrink-0 tabular-nums ${status ? statusText[status] : "text-stone-500"}`}>
      {relativeExpiry(expiryDate, today, lang)}
    </span>
  );
}

/** A Product's Stock as a number that opens – / +: amber when Running Low, dimmed when Out of Stock. */
function StockStepper({
  product,
  onChangeStock,
}: {
  product: ProductRowData;
  onChangeStock: (product: ProductRowData, change: StockChange) => void;
}) {
  const t = useT();
  const outOfStock = product.stock === 0;
  return (
    <NumberStepper
      text={String(product.stock)}
      label={t("koti.changeStock", { name: product.name, stock: product.stock })}
      dimmed={outOfStock}
      runningLow={lowNotOut(product)}
      onDecrease={() => onChangeStock(product, "use")}
      decreaseLabel={t("koti.use", { name: product.name })}
      decreaseDisabled={outOfStock}
      onIncrease={() => onChangeStock(product, "restock")}
      increaseLabel={t("koti.restock", { name: product.name })}
    />
  );
}

const stockRule = (change: StockChange) => (change === "restock" ? (state: StockState) => applyRestock(state, 1) : applyUse);

/**
 * Applies + / – (optimistically, so taps feel instant) and, at the tap, shows
 * the Stock it changes to with Undo. Only the server knows the Minimum Stock,
 * so when it answers that the change made the Product Running Low, the
 * "running low" toast takes over and offers Need More; nothing goes on the
 * list unless it is tapped.
 */
function useStockChange() {
  const t = useT();
  const showChangeToast = useChangeToast();
  const showRunningLow = useRunningLowToast();
  const undoStockChange = useUndoStockChange();
  const adjustStock = useMutation(api.products.adjustStock).withOptimisticUpdate((store, { productId, change }) =>
    changeStockLocally(store, productId, stockRule(change)),
  );

  return useCallback(
    (product: ProductRowData, change: StockChange) => {
      const from = product.stock;
      const to = stockRule(change)({ stock: from }).stock;
      if (from === to) return;
      const changed = adjustStock({ productId: product._id, change });
      const shown = showChangeToast(t("koti.stockChanged", { name: product.name, from, to }), changed, (done) =>
        undoStockChange(product, done)(),
      );
      changed.then(
        (done) => {
          if (done.crossedIntoRunningLow) showRunningLow(product, undoStockChange(product, done), shown);
        },
        () => {},
      );
    },
    [adjustStock, undoStockChange, showChangeToast, showRunningLow, t],
  );
}

/** The Product just added from the add sheet, for its row to flash; it lets go once the flash is over. */
function useJustAdded() {
  const [id, set] = useState<Id<"products"> | null>(null);
  useEffect(() => {
    if (id === null) return;
    // Longer than `.just-added` in globals.css, so the flash plays out.
    const timer = setTimeout(() => set(null), 2000);
    return () => clearTimeout(timer);
  }, [id]);
  return { id, set };
}

/** The Locations folded shut on Koti, remembered on this device, a toggle for one, and opening one. */
function useFoldedLocations() {
  const [folded, setFolded] = useState(() => new Set(foldedLocations()));
  const change = useCallback((id: Id<"locations">, shut: (isShut: boolean) => boolean) => {
    setFolded((current) => {
      const next = new Set(current);
      if (shut(next.has(id))) next.add(id);
      else next.delete(id);
      rememberFoldedLocations([...next]);
      return next;
    });
  }, []);
  const toggle = useCallback((id: Id<"locations">) => change(id, (isShut) => !isShut), [change]);
  const unfold = useCallback((id: Id<"locations">) => change(id, () => false), [change]);
  return [folded, toggle, unfold] as const;
}

/**
 * The Location section the Member has scrolled to, which new Products default to.
 * At the top of Koti nothing is "in view", so the last used Location wins.
 */
function useLocationInView(ready: boolean) {
  const [inView, setInView] = useState<Id<"locations"> | null>(null);
  const visible = useRef(new Set<Element>());

  useEffect(() => {
    if (!ready) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-location-id]"));
    const update = () => {
      if (window.scrollY < 8) return setInView(null);
      const first = sections.find((section) => visible.current.has(section));
      setInView((first?.dataset.locationId as Id<"locations"> | undefined) ?? null);
    };
    // Sections crossing a band in the upper part of the screen count as in view.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.current.add(entry.target);
          else visible.current.delete(entry.target);
        }
        update();
      },
      { rootMargin: "-20% 0px -50% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update);
    };
  }, [ready]);

  return inView;
}
