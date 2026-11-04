"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AddFab } from "@/components/AddFab";
import { AppLink } from "@/components/AppLink";
import { CategorySelect } from "@/components/CategorySelect";
import { useProductSearch } from "@/components/Combobox";
import { CupboardNote } from "@/components/Cupboard";
import { ExpiryKindSelect } from "@/components/ExpiryKindSelect";
import { ChevronDownIcon, CloseIcon, ScanIcon, SearchIcon } from "@/components/icons";
import { useLayoutMotion } from "@/components/motion";
import { NeedsAttention, statusText } from "@/components/NeedsAttention";
import { Sheet } from "@/components/Sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { nameKey, tidyName } from "@/convex/productNames";
import { type ExpiryKind, expiryStatus, isRunningLow } from "@/convex/stock";
import { localToday, relativeExpiry } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";
import { lastLocation, rememberLocation } from "@/lib/remembered";
import { card, cardList, field, primaryButton } from "@/lib/styles";

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
 * Komero: a search that narrows the list, Needs Attention, then each Location
 * with its Products as calm two-line rows, name and Expiry Date with the Stock
 * beside them. A row opens its Product page, where the Stock is changed. The
 * floating + adds a Product to the Location in view.
 */
export default function KotiScreen() {
  const t = useT();
  const lang = useLang();
  const inventory = useQuery(api.inventory.get);
  const locationInView = useLocationInView(inventory !== undefined);
  const [searchText, setSearchText] = useState("");
  const [adding, setAdding] = useState<{ name: string; locationId: Id<"locations"> } | null>(null);
  const justAdded = useJustAdded();
  const layout = useLayoutMotion();

  if (inventory === undefined) return <p className="text-stone-500">{t("common.loading")}</p>;

  const remembered = inventory.find((location) => location._id === lastLocation())?._id;
  const addTo = locationInView ?? remembered ?? inventory[0]?._id;
  const empty = inventory.every((location) => location.products.length === 0);
  const searching = searchText.trim() !== "";
  const locations = inventory
    .map((location) => ({
      ...location,
      products: location.products
        .filter((product) => nameKey(product.name).includes(nameKey(searchText)))
        .sort((a, b) => a.name.localeCompare(b.name, lang)),
    }))
    .filter((location) => !searching || location.products.length > 0);

  // One layout group, so the Locations slide down smoothly when Needs Attention appears.
  return (
    <LayoutGroup>
      {empty ? (
        <EmptyKoti />
      ) : (
        <div className="flex flex-col gap-6">
          <Search value={searchText} onChange={setSearchText} />
          {!searching && <NeedsAttention />}
          {locations.length === 0 && (
            <p className="px-1 text-sm text-stone-500">{t("koti.noMatches", { text: searchText.trim() })}</p>
          )}
          {locations.map((location) => (
            <motion.section
              key={location._id}
              layout={layout}
              data-location-id={location._id}
              className="flex flex-col gap-2"
            >
              <h2 className="flex items-baseline gap-2 px-1">
                <span className="font-display text-lg">{location.name}</span>
                <span className="text-xs font-semibold text-stone-400 tabular-nums">{location.products.length}</span>
              </h2>
              {location.products.length === 0 ? (
                <p className={`${card} px-4 py-3 text-sm text-stone-500`}>{t("koti.noProducts")}</p>
              ) : (
                <ul aria-label={location.name} className={`${cardList} overflow-hidden`}>
                  {location.products.map((product) => (
                    <ProductRow key={product._id} product={product} justAdded={product._id === justAdded.id} />
                  ))}
                </ul>
              )}
            </motion.section>
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
            onCreated={(productId) => {
              setSearchText("");
              justAdded.set(productId);
            }}
            onFailed={(name, locationId) => setAdding({ name, locationId })}
          />
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}

/** Narrows Komero to the Products whose name contains the text. */
function Search({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const t = useT();
  return (
    <div className="relative flex items-center">
      <SearchIcon width={18} height={18} className="pointer-events-none absolute left-3 text-stone-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("koti.search")}
        aria-label={t("koti.search")}
        enterKeyHint="search"
        autoComplete="off"
        className={`${field} w-full pr-11 pl-10 [&::-webkit-search-cancel-button]:hidden`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("common.clear")}
          className="absolute right-0 flex h-11 w-11 items-center justify-center text-stone-400"
        >
          <CloseIcon width={18} height={18} />
        </button>
      )}
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
  onCreated: (productId: Id<"products">) => void;
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
    }).then(onCreated, () => onFailed(tidy, locationId));
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

/** Running Low but not yet Out of Stock, which rows already show. */
const lowNotOut = (product: ProductRowData) =>
  product.stock > 0 && isRunningLow({ stock: product.stock, minimumStock: product.minimumStock ?? undefined });

/**
 * A Product in its Location: its name with how far off its Expiry Date is
 * under it, and its Stock beside it. Tapping it opens the Product page. Out of
 * Stock Products stay listed, dimmed. A Product just added scrolls into view
 * and flashes.
 */
function ProductRow({ product, justAdded }: { product: ProductRowData; justAdded: boolean }) {
  const t = useT();
  const row = useRef<HTMLLIElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (justAdded) row.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [justAdded, reduced]);

  const outOfStock = product.stock === 0;
  return (
    // Clear of the top bar and the bottom tab bar when scrolled into view.
    <li ref={row} className={`scroll-mt-20 scroll-mb-28 ${justAdded ? "just-added" : ""}`}>
      <AppLink
        href={`/koti/${product._id}`}
        aria-label={t("koti.productLabel", { name: product.name, stock: product.stock })}
        className="flex min-h-14 items-center gap-3 px-4 py-2"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate font-medium ${outOfStock ? "text-stone-400 dark:text-stone-500" : ""}`}>
            {product.name}
          </span>
          <ExpiryDate product={product} />
        </span>
        <span
          className={`min-w-9 shrink-0 rounded-full px-2 py-0.5 text-center font-display text-base tabular-nums ${
            outOfStock
              ? "text-stone-400 ring-1 ring-stone-300 ring-inset dark:ring-stone-700"
              : lowNotOut(product)
                ? "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300"
                : "bg-stone-100 dark:bg-stone-800"
          }`}
        >
          {product.stock}
        </span>
        <ChevronDownIcon width={16} height={16} className="shrink-0 -rotate-90 text-stone-300 dark:text-stone-600" />
      </AppLink>
    </li>
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
    <span className={`text-xs tabular-nums ${status ? statusText[status] : "text-stone-500"}`}>
      {relativeExpiry(expiryDate, today, lang)}
    </span>
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
