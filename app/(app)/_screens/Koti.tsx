"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AddFab } from "@/components/AddFab";
import { AppLink } from "@/components/AppLink";
import { CategorySelect } from "@/components/CategorySelect";
import { useProductSearch } from "@/components/Combobox";
import { CupboardNote } from "@/components/Cupboard";
import { ExpiryKindSelect } from "@/components/ExpiryKindSelect";
import { CloseIcon, ListIcon, ScanIcon, SearchIcon } from "@/components/icons";
import { useNeedMore } from "@/components/NeedMore";
import { Sheet } from "@/components/Sheet";
import { Stepper } from "@/components/Stepper";
import { useStockChange } from "@/components/StockToasts";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { nameKey, tidyName } from "@/convex/productNames";
import { type ExpiryKind, expiryStatus, isRunningLow, toAttentionState } from "@/convex/stock";
import { localToday, relativeExpiry } from "@/lib/dates";
import { entriesIn } from "@/lib/listUpdates";
import { useLang, useT } from "@/lib/i18n";
import { lastLocation, rememberLocation } from "@/lib/remembered";
import { field, group, groupHeader, groupRow, primaryButton, segment, statusTone } from "@/lib/styles";

const sheetField = `${field} w-full px-3`;
type Location = { _id: Id<"locations">; name: string };
type ProductRowData = {
  _id: Id<"products">;
  name: string;
  stock: number;
  expiryKind: ExpiryKind | null;
  expiryDate: string | null;
  minimumStock: number | null;
};
/**
 * Komero's filter tiles: everything, what is in Stock, what to use soon (by its
 * Expiry Date), what is Running Low, or what is Frequently Bought.
 */
type Filter = "all" | "inStock" | "useSoon" | "runningLow" | "frequentlyBought";
/** How a row shows under Frequently Bought: its Location, how often it was restocked, and how many are on the list. */
type Frequent = { locationName: string; days: number; onList: number | undefined };

const inStock = (product: ProductRowData) => product.stock > 0;

const usesSoon = (product: ProductRowData, today: string) => expiryStatus(toAttentionState(product), today) !== null;
const runningLow = (product: ProductRowData) => isRunningLow(toAttentionState(product));
// The Running Low tile leaves out Products without a Minimum Stock; at 0 they show greyed as Out of Stock instead.
const lowAgainstMinimum = (product: ProductRowData) => product.minimumStock !== null && runningLow(product);

/**
 * Komero: five tiles that count and filter (everything, in Stock, use soon,
 * Running Low against a Minimum Stock, Frequently Bought), a search, and tabs
 * to see one Location or all of them, kept at the top while scrolling. Each
 * Location is a grouped list of its Products, with their Expiry Date and a
 * Stock stepper; Frequently Bought is one list instead, most often restocked
 * first, each row with a Need More. A row opens its Product page. The
 * floating + adds a Product to the Location in view.
 */
export default function KotiScreen() {
  const t = useT();
  const lang = useLang();
  const inventory = useQuery(api.inventory.get);
  const restockDays = new Map((useQuery(api.frequentlyBought.get) ?? []).map((p) => [p.productId, p.days]));
  const list = useQuery(api.shoppingList.get);
  const [filter, setFilter] = useState<Filter>("all");
  const [chosenLocation, setChosenLocation] = useState<Id<"locations"> | null>(null);
  const [searchText, setSearchText] = useState("");
  const [adding, setAdding] = useState<{ name: string; locationId: Id<"locations"> } | null>(null);
  const justAdded = useJustAdded();
  const today = localToday();

  // A Location deleted meanwhile no longer narrows anything.
  const locationTab = inventory?.some((location) => location._id === chosenLocation) ? chosenLocation : null;
  const searching = searchText.trim() !== "";
  const narrowed = searching || filter !== "all";
  const searchKey = nameKey(searchText);
  const filtered = {
    all: () => true,
    inStock,
    useSoon: (product: ProductRowData) => usesSoon(product, today),
    runningLow: lowAgainstMinimum,
    frequentlyBought: (product: ProductRowData) => restockDays.has(product._id),
  }[filter];
  const shows = (product: ProductRowData) => nameKey(product.name).includes(searchKey) && filtered(product);
  const locations = (inventory ?? [])
    .filter((location) => locationTab === null || location._id === locationTab)
    .map((location) => ({
      ...location,
      products: location.products.filter(shows).sort((a, b) => a.name.localeCompare(b.name, lang)),
    }))
    // An empty Location shows only while nothing narrows the list.
    .filter((location) => !narrowed || location.products.length > 0);
  const locationInView = useLocationInView(locations.map((location) => location._id).join());
  const onList = new Map(
    (list ? entriesIn(list) : []).flatMap((entry) => ("productId" in entry ? [[entry.productId, entry.quantity]] : [])),
  );
  const frequentRows = locations
    .flatMap((location) => location.products.map((product) => ({ product, locationName: location.name })))
    .map(({ product, locationName }) => ({
      product,
      frequent: { locationName, days: restockDays.get(product._id) ?? 0, onList: onList.get(product._id) },
    }))
    .sort((a, b) => b.frequent.days - a.frequent.days || a.product.name.localeCompare(b.product.name, lang));

  if (inventory === undefined) return <p className="text-stone-500">{t("common.loading")}</p>;

  const all = inventory.flatMap((location) => location.products);
  const remembered = inventory.find((location) => location._id === lastLocation())?._id;
  const addTo = locationTab ?? locationInView ?? remembered ?? inventory[0]?._id;

  return (
    <>
      {all.length === 0 ? (
        <EmptyKoti />
      ) : (
        <div className="flex flex-col gap-5">
          <div role="group" aria-label={t("koti.filters")} className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <FilterTile
              label={t("koti.all")}
              count={all.length}
              chosen={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterTile
              label={t("koti.inStock")}
              count={all.filter(inStock).length}
              chosen={filter === "inStock"}
              onClick={() => setFilter(filter === "inStock" ? "all" : "inStock")}
            />
            <FilterTile
              label={t("koti.useSoon")}
              count={all.filter((product) => usesSoon(product, today)).length}
              tone={statusTone.expiringSoon.text}
              chosen={filter === "useSoon"}
              onClick={() => setFilter(filter === "useSoon" ? "all" : "useSoon")}
            />
            <FilterTile
              label={t("attention.runningLow")}
              count={all.filter(lowAgainstMinimum).length}
              tone={statusTone.runningLow.text}
              chosen={filter === "runningLow"}
              onClick={() => setFilter(filter === "runningLow" ? "all" : "runningLow")}
            />
            <FilterTile
              label={t("koti.frequentlyBought")}
              count={all.filter((product) => restockDays.has(product._id)).length}
              chosen={filter === "frequentlyBought"}
              onClick={() => setFilter(filter === "frequentlyBought" ? "all" : "frequentlyBought")}
              className="col-span-2 sm:col-span-1"
            />
          </div>
          <Search value={searchText} onChange={setSearchText} />
          <LocationTabs
            locations={inventory.map((location) => ({ ...location, count: location.products.length }))}
            chosen={locationTab}
            onChoose={setChosenLocation}
          />
          {locations.length === 0 && (
            <p className="px-1 text-sm text-stone-500">
              {searching ? t("koti.noMatches", { text: searchText.trim() })
                : filter === "inStock" ? t("koti.noneInStock")
                : filter === "useSoon" ? t("koti.noneUseSoon")
                : filter === "frequentlyBought" ? t("koti.noneFrequentlyBought")
                : t("koti.noneRunningLow")}
            </p>
          )}
          {filter === "frequentlyBought" && frequentRows.length > 0 && (
            <ul aria-label={t("koti.frequentlyBought")} className={group}>
              {frequentRows.map(({ product, frequent }) => (
                <ProductRow key={product._id} product={product} today={today} justAdded={false} frequent={frequent} />
              ))}
            </ul>
          )}
          {filter !== "frequentlyBought" && locations.map((location) => (
            <section key={location._id} data-location-id={location._id}>
              <h2 className={`${groupHeader} flex justify-between`}>
                <span>{location.name}</span>
                <span className="tabular-nums">{location.products.length}</span>
              </h2>
              {location.products.length === 0 ? (
                <p className={`${group} px-4 py-3 text-secondary`}>{t("koti.noProducts")}</p>
              ) : (
                <ul aria-label={location.name} className={group}>
                  {location.products.map((product) => (
                    <ProductRow
                      key={product._id}
                      product={product}
                      today={today}
                      justAdded={product._id === justAdded.id}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
      {addTo && (
        <AddFab
          label={t("koti.addTitle")}
          // Opening synchronously inside the tap lets the sheet focus Name, so phones show the keyboard.
          onClick={() => flushSync(() => setAdding({ name: "", locationId: addTo }))}
        />
      )}
      <AnimatePresence>
        {adding && (
          <AddSheet
            key="add"
            initialName={adding.name}
            locations={inventory}
            initialLocationId={adding.locationId}
            onClose={() => setAdding(null)}
            onCreated={(productId, locationId) => {
              // Whatever narrowed the list makes way, so the new Product can show.
              setSearchText("");
              setFilter("all");
              if (locationTab !== null && locationTab !== locationId) setChosenLocation(locationId);
              justAdded.set(productId);
            }}
            onFailed={(name, locationId) => setAdding({ name, locationId })}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** A filter tile: a big count over its name. The chosen one is raised; tapping it again shows everything. */
function FilterTile({
  label,
  count,
  tone = "",
  chosen,
  onClick,
  className = "",
}: {
  label: string;
  count: number;
  tone?: string;
  chosen: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={chosen}
      className={`flex flex-col items-start gap-0.5 rounded-2xl px-3.5 py-3 text-left transition-colors duration-150 ${segment(chosen)} ${className}`}
    >
      <span className={`font-display text-[28px] leading-none tabular-nums ${tone}`}>{count}</span>
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

/** Narrows Komero to the Products whose name contains the text. */
function Search({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 rounded-full bg-surface pl-4 shadow-raised focus-within:ring-2 focus-within:ring-accent">
      <SearchIcon width={18} height={18} className="pointer-events-none shrink-0 text-stone-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("koti.search")}
        aria-label={t("koti.search")}
        enterKeyHint="search"
        autoComplete="off"
        className="min-h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("common.clear")}
          className="flex h-12 w-12 shrink-0 items-center justify-center text-stone-400"
        >
          <CloseIcon width={18} height={18} />
        </button>
      )}
    </div>
  );
}

/** "All" and each Location, scrolled sideways and kept at the top of the screen; the chosen one is raised. */
function LocationTabs({
  locations,
  chosen,
  onChoose,
}: {
  locations: (Location & { count: number })[];
  chosen: Id<"locations"> | null;
  onChoose: (locationId: Id<"locations"> | null) => void;
}) {
  const t = useT();
  const count = locations.reduce((sum, location) => sum + location.count, 0);
  const tabs = [{ _id: null, name: t("koti.all"), count }, ...locations];
  return (
    <div className="material sticky top-0 z-10 -mx-4 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
      <div
        role="group"
        aria-label={t("koti.locationTabs")}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]"
      >
        {tabs.map((tab) => {
          const active = chosen === tab._id;
          return (
            <button
              key={tab._id ?? "all"}
              type="button"
              aria-pressed={active}
              onClick={() => onChoose(tab._id)}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-150 ${segment(active)}`}
            >
              {tab.name}
              <span className="text-xs tabular-nums opacity-60">{tab.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
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
  onCreated,
  onFailed,
}: {
  initialName: string;
  locations: Location[];
  initialLocationId: Id<"locations">;
  onClose: () => void;
  onCreated: (productId: Id<"products">, locationId: Id<"locations">) => void;
  /** Adding didn't go through: the sheet reopens with what was typed. */
  onFailed: (name: string, locationId: Id<"locations">) => void;
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
  // The sheet closes at once, and reopens with the name if adding fails.
  const add = () => {
    if (!valid) return;
    const tidy = tidyName(name);
    rememberLocation(locationId);
    onClose();
    createProduct({
      name: tidy,
      locationId,
      categoryId: categoryId ?? undefined,
      stock,
      minimumStock,
      expiryKind: expiryKind ?? undefined,
      expiryDate: showsExpiryDate && expiryDate ? expiryDate : undefined,
    }).then(
      (productId) => onCreated(productId, locationId),
      () => onFailed(tidy, locationId),
    );
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

/**
 * A Product in its Location: its name, how far off its Expiry Date is
 * (coloured by what it means today), and its Stock, tinted when Running Low.
 * Tapping the Stock opens − n + to change it there, with the same toasts as
 * the Product page; tapping the rest opens the Product page. Out of Stock
 * Products stay listed, greyed. A Product just added scrolls into view and
 * flashes.
 */
function ProductRow({
  product,
  today,
  justAdded,
  frequent,
}: {
  product: ProductRowData;
  today: string;
  justAdded: boolean;
  frequent?: Frequent;
}) {
  const t = useT();
  const lang = useLang();
  const changeStock = useStockChange();
  const needMore = useNeedMore();
  const row = useRef<HTMLLIElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (justAdded) row.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [justAdded, reduced]);

  const outOfStock = product.stock === 0;
  const status = expiryStatus(toAttentionState(product), today);
  return (
    // Clear of the Location tabs and the floating + when scrolled into view.
    <li ref={row} className={`${groupRow} flex items-center pr-3 scroll-mt-20 scroll-mb-40 ${justAdded ? "just-added" : ""}`}>
      <AppLink
        href={`/koti/${product._id}`}
        aria-label={t("koti.productLabel", { name: product.name, stock: product.stock })}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 self-stretch py-2.5 pr-2 pl-4 active:bg-stone-100"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-[17px] ${outOfStock ? "text-secondary" : ""}`}>{product.name}</span>
          {frequent && (
            <span className="truncate text-xs text-secondary">
              {[
                frequent.locationName,
                t("koti.restockDays", { days: frequent.days }),
                frequent.onList && t("lista.onListCount", { quantity: frequent.onList }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </span>
        {product.expiryKind && product.expiryDate && (
          <span className={`shrink-0 text-[15px] tabular-nums ${status ? statusTone[status].text : "text-secondary"}`}>
            {relativeExpiry(product.expiryDate, today, lang)}
          </span>
        )}
      </AppLink>
      {frequent && (
        <button
          type="button"
          onClick={() => needMore(product)}
          aria-label={t("koti.needMore", { name: product.name })}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-accent"
        >
          <ListIcon width={22} height={22} />
        </button>
      )}
      <Stepper
        value={product.stock}
        pillLabel={t("koti.stockOf", { name: product.name, stock: product.stock })}
        pill={
          <span
            className={`min-w-8 rounded-full bg-stone-100 px-2.5 py-0.5 text-center text-[17px] font-semibold tabular-nums ${
              outOfStock ? "text-secondary" : runningLow(product) ? statusTone.runningLow.text : ""
            }`}
          >
            {product.stock}
          </span>
        }
        decrease={{
          label: t("koti.use", { name: product.name }),
          onClick: () => changeStock(product, "use"),
          disabled: outOfStock,
        }}
        increase={{ label: t("koti.restock", { name: product.name }), onClick: () => changeStock(product, "restock") }}
      />
    </li>
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

/**
 * The Location section the Member has scrolled to, which new Products default
 * to. At the top of Komero nothing is "in view", so the last used Location
 * wins. `shown` names the sections on screen, so they are watched again
 * whenever the filters, search or tabs change them.
 */
function useLocationInView(shown: string) {
  const [inView, setInView] = useState<Id<"locations"> | null>(null);
  const visible = useRef(new Set<Element>());

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-location-id]"));
    visible.current.clear();
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
  }, [shown]);

  return inView;
}
