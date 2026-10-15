"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { AppLink } from "@/components/AppLink";
import { CupboardNote } from "@/components/Cupboard";
import { ExpiryKindSelect } from "@/components/ExpiryKindSelect";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useChangeToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChevronDownIcon, ScanIcon } from "@/components/icons";
import { Fold, Reveal, settle, useLayoutMotion, useRowMotion } from "@/components/motion";
import { NeedsAttention, statusText } from "@/components/NeedsAttention";
import { SwipeToNeedMore } from "@/components/NeedMore";
import { NumberStepper } from "@/components/NumberStepper";
import { useRunningLowToast, useUndoStockChange } from "@/components/StockToasts";
import { tidyName } from "@/convex/productNames";
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

const noMore = { expiryKind: null, minimumStock: "" };
const moreFieldClass = `${field} w-full px-3`;
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
  const [quickAddLocation, setQuickAddLocation] = useState<Id<"locations"> | null>(null);
  const [folded, toggleFolded] = useFoldedLocations();
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
        <SearchAdd locations={inventory} locationInView={locationInView} onChangeStock={changeStock} />
        {empty ? <EmptyKoti /> : <NeedsAttention />}
        {inventory.map((location) => (
          <motion.section
            key={location._id}
            layout={layout}
            data-location-id={location._id}
            className="flex flex-col"
          >
            <div className="flex items-center gap-2 px-1">
              {/* The heading fills the row up to Quick add, so a tap anywhere beside it folds. */}
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
              {quickAddLocation !== location._id && (
                <button
                  type="button"
                  // Opening synchronously inside the tap lets the field take focus, so phones show the keyboard.
                  // A folded Location opens too, so the Products being added show up.
                  onClick={() =>
                    flushSync(() => {
                      setQuickAddLocation(location._id);
                      if (folded.has(location._id)) toggleFolded(location._id);
                    })
                  }
                  className="min-h-11 rounded-full px-3 text-sm font-medium text-stone-600 dark:text-stone-400"
                >
                  {t("koti.quickAdd")}
                </button>
              )}
            </div>
            <AnimatePresence initial={false}>
              {quickAddLocation === location._id && (
                <Reveal key="quickAdd" className="pt-1.5">
                  <QuickAdd location={location} onDone={() => setQuickAddLocation(null)} />
                </Reveal>
              )}
            </AnimatePresence>
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

/** The search/add field: matching Products as you type, or "+ Add" for a new one. */
function SearchAdd({
  locations,
  locationInView,
  onChangeStock,
}: {
  locations: (Location & { products: ProductRowData[] })[];
  locationInView: Id<"locations"> | null;
  onChangeStock: (product: ProductRowData, change: StockChange) => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [pickedLocation, setPickedLocation] = useState<Id<"locations"> | null>(null);
  const result = useQuery(api.products.search, text.trim() ? { text } : "skip");
  const createProduct = useMutation(api.products.create);
  const rowMotion = useRowMotion();
  // Search results don't carry Expiry Dates or Minimum Stock; the inventory does.
  const inventoryById = new Map(locations.flatMap((location) => location.products.map((product) => [product._id, product])));

  const remembered = locations.find((location) => location._id === lastLocation())?._id;
  const locationId = pickedLocation ?? locationInView ?? remembered ?? locations[0]?._id;

  const [more, setMore] = useState<{ expiryKind: ExpiryKind | null; minimumStock: string }>(noMore);
  const minimumStock = more.minimumStock.trim() === "" ? undefined : Number(more.minimumStock);
  const minimumStockValid = minimumStock === undefined || (Number.isInteger(minimumStock) && minimumStock >= 0);

  // A name that already exists can still be added with the button, next to its
  // warning; Enter, typed while searching for it, doesn't add a second one.
  // The field clears at once, ready for the next name; the typed one comes back if adding fails.
  const add = ({ fromEnter = false } = {}) => {
    if (!result?.name || !locationId || !minimumStockValid || (fromEnter && !result.canAdd)) return;
    const typed = text;
    setText("");
    setPickedLocation(null);
    setMore(noMore);
    rememberLocation(locationId);
    createProduct({ name: result.name, locationId, minimumStock, expiryKind: more.expiryKind ?? undefined }).catch(
      () => setText((current) => current || typed),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") add({ fromEnter: true });
        }}
        placeholder={t("koti.search")}
        aria-label={t("koti.search")}
        enterKeyHint="done"
        autoComplete="off"
        className={`${field} w-full px-4 py-3`}
      />
      {result && (
        <div className="flex flex-col gap-2">
          {result.duplicate && <DuplicateWarning duplicate={result.duplicate} />}
          {result.matches.length > 0 && (
            <ul className={`${cardList} flex flex-col overflow-hidden`}>
              <AnimatePresence initial={false}>
                {result.matches.map((match) => (
                  <motion.li key={match._id} {...rowMotion}>
                    <MatchRow
                      product={inventoryById.get(match._id) ?? match}
                      locationName={match.locationName}
                      onChangeStock={onChangeStock}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          {result.name && locationId && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => add()}
                  disabled={!minimumStockValid}
                  className={`${primaryButton} min-h-11 flex-1 truncate px-4 py-2 text-left`}
                >
                  {t("koti.add", { name: result.name })}
                </button>
                <select
                  value={locationId}
                  onChange={(event) => setPickedLocation(event.target.value as Id<"locations">)}
                  aria-label={t("koti.addTo")}
                  className={`${field} px-2`}
                >
                  {locations.map((location) => (
                    <option key={location._id} value={location._id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
              <Disclosure summary={t("koti.more")}>
                <div className="flex gap-2">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-stone-500">{t("product.expiryKind")}</span>
                    <ExpiryKindSelect
                      value={more.expiryKind}
                      onChange={(expiryKind) => setMore({ ...more, expiryKind })}
                      className={moreFieldClass}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-stone-500">{t("product.minimumStock")}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={more.minimumStock}
                      onChange={(event) => setMore({ ...more, minimumStock: event.target.value })}
                      placeholder={t("product.minimumStockNone")}
                      className={moreFieldClass}
                    />
                  </label>
                </div>
              </Disclosure>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A part that opens under its summary; its content moves with the same spring as its chevron. */
function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <div className="flex flex-col text-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center gap-1 self-start text-stone-600 dark:text-stone-400"
      >
        {summary}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={settle} className="flex">
          <ChevronDownIcon width={18} height={18} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <Reveal key="content">
            <div id={contentId}>{children}</div>
          </Reveal>
        )}
      </AnimatePresence>
    </div>
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

/**
 * Quick-add for filling a Location on day one: the field keeps focus, and each
 * Enter adds the typed name as a Product here with Stock 1.
 */
function QuickAdd({ location, onDone }: { location: Location; onDone: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const result = useQuery(api.products.search, text.trim() ? { text } : "skip");
  const createProduct = useMutation(api.products.create);

  // Names being added right now, so a fast second Enter on the same text adds nothing.
  const adding = useRef(new Set<string>());

  // An existing name is only warned about while typing; Enter adds it anyway.
  const add = () => {
    const name = tidyName(text);
    if (name === "" || adding.current.has(name)) return;
    adding.current.add(name);
    setText("");
    rememberLocation(location._id);
    createProduct({ name, locationId: location._id })
      .catch(() => setText((current) => current || name))
      .finally(() => adding.current.delete(name));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            } else if (event.key === "Escape") onDone();
          }}
          autoFocus
          placeholder={t("koti.quickAddPlaceholder")}
          aria-label={t("koti.quickAddTo", { location: location.name })}
          enterKeyHint="enter"
          autoComplete="off"
          className={`${field} min-w-0 flex-1 px-4 py-3`}
        />
        <button
          type="button"
          // A name still in the field is added too, so Done works without Enter.
          onClick={() => {
            add();
            onDone();
          }}
          className={`${primaryButton} min-h-11 px-4`}
        >
          {t("koti.quickAddDone")}
        </button>
      </div>
      {result?.duplicate && <DuplicateWarning duplicate={result.duplicate} />}
    </div>
  );
}

function DuplicateWarning({ duplicate }: { duplicate: { name: string; locationName: string } }) {
  const t = useT();
  return (
    <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
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
}: {
  label: string;
  products: ProductRowData[];
  sort: Sort;
  onSort: (column: SortColumn) => void;
  onChangeStock: (product: ProductRowData, change: StockChange) => void;
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
        <ProductRow key={product._id} product={product} onChangeStock={onChangeStock} />
      ))}
    </div>
  );
}

const dimmedName = "text-stone-400 dark:text-stone-500";

/**
 * A Product in its Location's table: its name, how far off its Expiry Date is,
 * and its Stock as a number that opens – / +; swipe it left for Need More.
 * Out of Stock Products stay listed, dimmed.
 */
function ProductRow({
  product,
  onChangeStock,
}: {
  product: ProductRowData;
  onChangeStock: (product: ProductRowData, change: StockChange) => void;
}) {
  return (
    <SwipeToNeedMore product={product} role="row" className={`${tableRow} min-h-9 text-sm`}>
      <div role="cell" className={cellWidths.name}>
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

/** A Product found by Koti's search: its name, its Location and Expiry Date under it, and its Stock. */
function MatchRow({
  product,
  locationName,
  onChangeStock,
}: {
  product: ProductRowData;
  locationName: string;
  onChangeStock: (product: ProductRowData, change: StockChange) => void;
}) {
  return (
    <SwipeToNeedMore product={product} className="flex min-h-11 items-center gap-3 px-4 py-1 text-sm">
      <AppLink href={`/koti/${product._id}`} className="min-h-11 min-w-0 flex-1 content-center">
        <p className={`truncate ${product.stock === 0 ? dimmedName : ""}`}>{product.name}</p>
        <p className="flex gap-2 text-xs">
          <span className="truncate text-stone-500">{locationName}</span>
          <ExpiryDate product={product} />
        </p>
      </AppLink>
      <StockStepper product={product} onChangeStock={onChangeStock} />
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

/** The Locations folded shut on Koti, remembered on this device, and a toggle for one. */
function useFoldedLocations() {
  const [folded, setFolded] = useState(() => new Set(foldedLocations()));
  const toggle = useCallback((id: Id<"locations">) => {
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      rememberFoldedLocations([...next]);
      return next;
    });
  }, []);
  return [folded, toggle] as const;
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
