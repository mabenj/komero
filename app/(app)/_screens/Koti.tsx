"use client";

import { useMutation, useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { AppLink } from "@/components/AppLink";
import { ExpiryKindSelect } from "@/components/ExpiryKindSelect";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { NeedsAttention } from "@/components/NeedsAttention";
import { SwipeToNeedMore, useNeedMore } from "@/components/NeedMore";
import { tidyName } from "@/convex/productNames";
import { applyRestock, applyUse, type ExpiryKind, expiryStatus } from "@/convex/stock";
import { formatDay, localToday } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";
import { lastLocation, rememberLocation } from "@/lib/remembered";

type StockChange = "restock" | "use";

const noMore = { expiryKind: null, minimumStock: "" };
const moreFieldClass = "min-h-11 w-full rounded-xl border border-zinc-300 bg-background px-3 text-base dark:border-zinc-700";
type Location = { _id: Id<"locations">; name: string };
type ProductRowData = {
  _id: Id<"products">;
  name: string;
  stock: number;
  expiryKind?: ExpiryKind | null;
  expiryDate?: string | null;
};

export default function KotiScreen() {
  const t = useT();
  const inventory = useQuery(api.inventory.get);
  const locationInView = useLocationInView(inventory !== undefined);
  const changeStock = useStockChange();
  const [quickAddLocation, setQuickAddLocation] = useState<Id<"locations"> | null>(null);

  if (inventory === undefined) return <p className="text-zinc-500">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-6">
      <SearchAdd locations={inventory} locationInView={locationInView} onChangeStock={changeStock} />
      <NeedsAttention />
      {inventory.map((location) => (
        <section key={location._id} data-location-id={location._id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{location.name}</h2>
            {quickAddLocation !== location._id && (
              <button
                type="button"
                // Opening synchronously inside the tap lets the field take focus, so phones show the keyboard.
                onClick={() => flushSync(() => setQuickAddLocation(location._id))}
                className="min-h-11 rounded-full px-3 text-sm font-medium text-zinc-600 dark:text-zinc-400"
              >
                {t("koti.quickAdd")}
              </button>
            )}
          </div>
          {quickAddLocation === location._id && (
            <QuickAdd location={location} onDone={() => setQuickAddLocation(null)} />
          )}
          {location.products.length === 0 && <p className="text-sm text-zinc-500">{t("koti.noProducts")}</p>}
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {location.products.map((product) => (
              <ProductRow key={product._id} product={product} onChangeStock={changeStock} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The search/add field: matching Products as you type, or "+ Add" for a new one. */
function SearchAdd({
  locations,
  locationInView,
  onChangeStock,
}: {
  locations: Location[];
  locationInView: Id<"locations"> | null;
  onChangeStock: (product: ProductRowData, change: StockChange) => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [pickedLocation, setPickedLocation] = useState<Id<"locations"> | null>(null);
  const result = useQuery(api.products.search, text.trim() ? { text } : "skip");
  const createProduct = useMutation(api.products.create);

  const remembered = locations.find((location) => location._id === lastLocation())?._id;
  const locationId = pickedLocation ?? locationInView ?? remembered ?? locations[0]?._id;

  const [more, setMore] = useState<{ expiryKind: ExpiryKind | null; minimumStock: string }>(noMore);
  const minimumStock = more.minimumStock.trim() === "" ? undefined : Number(more.minimumStock);
  const minimumStockValid = minimumStock === undefined || (Number.isInteger(minimumStock) && minimumStock >= 0);

  // A name that already exists can still be added with the button, next to its
  // warning; Enter, typed while searching for it, doesn't add a second one.
  const add = async ({ fromEnter = false } = {}) => {
    if (!result?.name || !locationId || !minimumStockValid || (fromEnter && !result.canAdd)) return;
    await createProduct({ name: result.name, locationId, minimumStock, expiryKind: more.expiryKind ?? undefined });
    rememberLocation(locationId);
    setText("");
    setPickedLocation(null);
    setMore(noMore);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void add({ fromEnter: true });
        }}
        placeholder={t("koti.search")}
        aria-label={t("koti.search")}
        enterKeyHint="done"
        autoComplete="off"
        className="w-full rounded-xl border border-zinc-300 bg-background px-4 py-3 text-base dark:border-zinc-700"
      />
      {result && (
        <div className="flex flex-col gap-2">
          {result.duplicate && <DuplicateWarning duplicate={result.duplicate} />}
          {result.matches.length > 0 && (
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {result.matches.map((product) => (
                <ProductRow
                  key={product._id}
                  product={product}
                  detail={product.locationName}
                  onChangeStock={onChangeStock}
                />
              ))}
            </ul>
          )}
          {result.name && locationId && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void add()}
                  disabled={!minimumStockValid}
                  className="min-h-11 flex-1 truncate rounded-xl bg-foreground px-4 py-2 text-left font-semibold text-background disabled:opacity-40"
                >
                  {t("koti.add", { name: result.name })}
                </button>
                <select
                  value={locationId}
                  onChange={(event) => setPickedLocation(event.target.value as Id<"locations">)}
                  aria-label={t("koti.addTo")}
                  className="min-h-11 rounded-xl border border-zinc-300 bg-background px-2 dark:border-zinc-700"
                >
                  {locations.map((location) => (
                    <option key={location._id} value={location._id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
              <details className="text-sm">
                <summary className="min-h-11 content-center text-zinc-600 dark:text-zinc-400">{t("koti.more")}</summary>
                <div className="flex gap-2">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-zinc-500">{t("product.expiryKind")}</span>
                    <ExpiryKindSelect
                      value={more.expiryKind}
                      onChange={(expiryKind) => setMore({ ...more, expiryKind })}
                      className={moreFieldClass}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-zinc-500">{t("product.minimumStock")}</span>
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
              </details>
            </div>
          )}
        </div>
      )}
    </div>
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
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-background px-4 py-3 text-base dark:border-zinc-700"
        />
        <button
          type="button"
          onClick={onDone}
          className="min-h-11 rounded-xl bg-foreground px-4 font-semibold text-background"
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
    <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {t("koti.duplicate", { name: duplicate.name, location: duplicate.locationName })}
    </p>
  );
}

/**
 * A Product with its Stock and inline – / +, and its Expiry Date when it has
 * one; swipe it left for Need More. Out of Stock Products stay listed, dimmed.
 */
function ProductRow({
  product,
  detail,
  onChangeStock,
}: {
  product: ProductRowData;
  detail?: string;
  onChangeStock: (product: ProductRowData, change: StockChange) => void;
}) {
  const t = useT();
  const outOfStock = product.stock === 0;
  const buttonClass =
    "flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 text-xl disabled:opacity-30 dark:border-zinc-700";

  return (
    <SwipeToNeedMore productId={product._id}>
      <AppLink href={`/koti/${product._id}`} className="min-h-11 min-w-0 flex-1 content-center">
        <p className={`truncate ${outOfStock ? "text-zinc-400 dark:text-zinc-500" : ""}`}>{product.name}</p>
        {detail && <p className="truncate text-xs text-zinc-500">{detail}</p>}
      </AppLink>
      {product.expiryKind && product.expiryDate && (
        <DateBadge kind={product.expiryKind} date={product.expiryDate} />
      )}
      <button
        type="button"
        className={buttonClass}
        disabled={outOfStock}
        aria-label={t("koti.use", { name: product.name })}
        onClick={() => onChangeStock(product, "use")}
      >
        <MinusIcon width={20} height={20} />
      </button>
      <span className={`w-8 text-center tabular-nums ${outOfStock ? "text-zinc-400" : "font-semibold"}`}>
        {product.stock}
      </span>
      <button
        type="button"
        className={buttonClass}
        aria-label={t("koti.restock", { name: product.name })}
        onClick={() => onChangeStock(product, "restock")}
      >
        <PlusIcon width={20} height={20} />
      </button>
    </SwipeToNeedMore>
  );
}

const badgeTones = {
  expired: "bg-red-600 text-white",
  checkIt: "bg-amber-500 text-white",
  expiringSoon: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  none: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

/** The Expiry Date on a Koti row, coloured by what it means today. */
function DateBadge({ kind, date }: { kind: ExpiryKind; date: string }) {
  const t = useT();
  const lang = useLang();
  const status = expiryStatus({ stock: 1, expiryKind: kind, expiryDate: date }, localToday());
  const tone = status === "expired" || status === "checkIt" || status === "expiringSoon" ? status : "none";
  const label = t(`expiry.${kind}`, { date: formatDay(date, lang) });
  return (
    <span
      title={label}
      aria-label={label}
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${badgeTones[tone]}`}
    >
      {formatDay(date, lang)}
    </span>
  );
}

/**
 * Applies + / – (optimistically, so taps feel instant) and offers to undo it.
 * When the change makes the Product Running Low, the toast says so and offers
 * Need More; nothing goes on the list unless it is tapped.
 */
function useStockChange() {
  const t = useT();
  const showUndoToast = useUndoToast();
  const needMore = useNeedMore();
  const adjustStock = useMutation(api.products.adjustStock).withOptimisticUpdate(
    (store, { productId, change }) => setStockLocally(store, productId, change),
  );
  const undoStockChange = useMutation(api.products.undoStockChange);

  return useCallback(
    async (product: ProductRowData, change: StockChange) => {
      const { from, to, crossedIntoRunningLow } = await adjustStock({ productId: product._id, change });
      if (from === to) return;
      const undo = () => void undoStockChange({ productId: product._id, from, to });
      if (crossedIntoRunningLow) {
        showUndoToast(t("koti.runningLow", { name: product.name }), undo, {
          label: t("koti.addToList"),
          run: () => void needMore(product._id),
        });
      } else {
        showUndoToast(t("koti.stockChanged", { name: product.name, from, to }), undo);
      }
    },
    [adjustStock, undoStockChange, showUndoToast, needMore, t],
  );
}

/** The same Stock and Expiry Date rules as the server, applied to a row. */
function apply<P extends ProductRowData>(product: P, change: StockChange): P {
  const state = {
    stock: product.stock,
    expiryKind: product.expiryKind ?? undefined,
    expiryDate: product.expiryDate ?? undefined,
  };
  const next = change === "restock" ? applyRestock(state, 1) : applyUse(state);
  return "expiryDate" in product
    ? { ...product, stock: next.stock, expiryDate: next.expiryDate ?? null }
    : { ...product, stock: next.stock };
}

function setStockLocally(store: OptimisticLocalStore, productId: Id<"products">, change: StockChange) {
  const update = <P extends ProductRowData>(product: P): P =>
    product._id === productId ? apply(product, change) : product;

  const inventory = store.getQuery(api.inventory.get, {});
  if (inventory) {
    store.setQuery(
      api.inventory.get,
      {},
      inventory.map((location) => ({ ...location, products: location.products.map(update) })),
    );
  }
  for (const { args, value } of store.getAllQueries(api.products.search)) {
    if (value) store.setQuery(api.products.search, args, { ...value, matches: value.matches.map(update) });
  }
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
