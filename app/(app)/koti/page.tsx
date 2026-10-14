"use client";

import { useMutation, useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Toast, UndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { applyRestock, applyUse } from "@/convex/stock";
import { useT } from "@/lib/i18n";
import { lastLocation, rememberLocation } from "@/lib/lastLocation";

type StockChange = "restock" | "use";
type Location = { _id: Id<"locations">; name: string };
type ProductRowData = { _id: Id<"products">; name: string; stock: number };

export default function KotiPage() {
  const t = useT();
  const inventory = useQuery(api.inventory.get);
  const locationInView = useLocationInView(inventory !== undefined);
  const [toast, setToast] = useState<Toast | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const changeStock = useStockChange(setToast);

  if (inventory === undefined) return <p className="text-zinc-500">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-6">
      <SearchAdd locations={inventory} locationInView={locationInView} onChangeStock={changeStock} />
      {inventory.map((location) => (
        <section key={location._id} data-location-id={location._id} className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{location.name}</h2>
          {location.products.length === 0 && <p className="text-sm text-zinc-500">{t("koti.noProducts")}</p>}
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {location.products.map((product) => (
              <ProductRow key={product._id} product={product} onChangeStock={changeStock} />
            ))}
          </ul>
        </section>
      ))}
      <UndoToast toast={toast} onClose={closeToast} />
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

  const add = async () => {
    if (!result?.canAdd || !locationId) return;
    await createProduct({ name: result.name, locationId });
    rememberLocation(locationId);
    setText("");
    setPickedLocation(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void add();
        }}
        placeholder={t("koti.search")}
        aria-label={t("koti.search")}
        enterKeyHint="done"
        autoComplete="off"
        className="w-full rounded-xl border border-zinc-300 bg-background px-4 py-3 text-base dark:border-zinc-700"
      />
      {result && (
        <div className="flex flex-col gap-2">
          {result.duplicate && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {t("koti.duplicate", { name: result.duplicate.name, location: result.duplicate.locationName })}
            </p>
          )}
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
          {result.canAdd && locationId && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void add()}
                className="min-h-11 flex-1 truncate rounded-xl bg-foreground px-4 py-2 text-left font-semibold text-background"
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
          )}
        </div>
      )}
    </div>
  );
}

/** A Product with its Stock and inline – / +. Out of Stock Products stay listed, dimmed. */
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
    <li className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className={`truncate ${outOfStock ? "text-zinc-400 dark:text-zinc-500" : ""}`}>{product.name}</p>
        {detail && <p className="truncate text-xs text-zinc-500">{detail}</p>}
      </div>
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
    </li>
  );
}

/** Applies + / – (optimistically, so taps feel instant) and offers to undo it. */
function useStockChange(showToast: (toast: Toast) => void) {
  const t = useT();
  const adjustStock = useMutation(api.products.adjustStock).withOptimisticUpdate(
    (store, { productId, change }) => setStockLocally(store, productId, (stock) => apply(stock, change)),
  );
  const undoStockChange = useMutation(api.products.undoStockChange);

  return useCallback(
    async (product: ProductRowData, change: StockChange) => {
      const { from, to } = await adjustStock({ productId: product._id, change });
      if (from === to) return;
      showToast({
        id: Date.now(),
        message: t("koti.stockChanged", { name: product.name, from, to }),
        undo: () => void undoStockChange({ productId: product._id, from, to }),
      });
    },
    [adjustStock, undoStockChange, showToast, t],
  );
}

function apply(stock: number, change: StockChange) {
  return (change === "restock" ? applyRestock({ stock }, 1) : applyUse({ stock })).stock;
}

function setStockLocally(store: OptimisticLocalStore, productId: Id<"products">, next: (stock: number) => number) {
  const update = <P extends ProductRowData>(product: P): P =>
    product._id === productId ? { ...product, stock: next(product.stock) } : product;

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
