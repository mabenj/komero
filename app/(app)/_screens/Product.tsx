"use client";

import { useMutation, useQuery } from "convex/react";
import { type ReactNode, useState } from "react";
import { BackLink, navigate } from "@/components/AppLink";
import { ActivityList } from "@/components/ActivityList";
import { CategorySelect } from "@/components/CategorySelect";
import { Quantity } from "@/components/EntryControls";
import { ExpiryKindSelect } from "@/components/ExpiryKindSelect";
import { MinusIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { useNeedMore } from "@/components/NeedMore";
import { useRunningLowToast, useStockChange } from "@/components/StockToasts";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { attentionStatus, isDate, toAttentionState } from "@/convex/stock";
import { formatExpiryDate, localToday, relativeExpiry } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";
import { entriesIn, setCategoryLocally } from "@/lib/listUpdates";
import {
  card,
  cardList,
  field,
  group,
  groupHeader,
  groupRow,
  raisedCard,
  secondaryButton,
  stepButton,
  statusTone,
  textLink,
} from "@/lib/styles";

type Product = NonNullable<FunctionReturnType<typeof api.products.get>>;

const fieldClass = `${field} w-full px-4 py-2`;

/**
 * One Product. It opens to read: its name, where it lives, what needs
 * attention, its Stock with – and +, its Expiry Date and Minimum Stock, how
 * many are on the Shopping List (or putting it there), and its recent
 * Activity. "Edit" swaps in the form to rename it, move it to another
 * Location, set its Category, Minimum Stock, Expiry Kind and Expiry Date,
 * remove Barcodes or delete it; "Done" goes back to reading. It opens over
 * the tab it was opened from, `home`, which Back and deleting return to.
 */
export default function ProductScreen({ productId, home }: { productId: Id<"products">; home: string }) {
  const t = useT();
  const product = useQuery(api.products.get, { productId });
  const [editing, setEditing] = useState(false);

  if (product === undefined) return <p className="text-stone-500">{t("common.loading")}</p>;
  if (product === null) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink home={home} />
        <p className="text-stone-500">{t("product.notFound")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <BackLink home={home} />
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className={`min-h-10 rounded-full px-5 font-semibold ${
            editing ? "bg-accent text-accent-foreground" : "bg-surface shadow-raised"
          }`}
        >
          {t(editing ? "product.editDone" : "product.edit")}
        </button>
      </div>
      {editing ? <EditProduct product={product} home={home} /> : <ReadProduct product={product} />}
    </div>
  );
}

/** The Product to read, with the everyday acts that change its Stock or the list, not the Product itself. */
function ReadProduct({ product }: { product: Product }) {
  const t = useT();
  const lang = useLang();
  const activities = useQuery(api.activities.forProduct, { productId: product._id });
  const list = useQuery(api.shoppingList.get);
  const changeStock = useStockChange();
  const needMore = useNeedMore();
  // The Product's Entry still to buy; one already in the Bag has been bought.
  const onList = list && entriesIn(list).find((entry) => "productId" in entry && entry.productId === product._id);

  const today = localToday();
  const status = attentionStatus(toAttentionState(product), today);

  return (
    <>
      <header className="flex flex-col gap-1.5 px-1">
        <h1 className="font-display text-[30px] leading-tight font-extrabold">{product.name}</h1>
        <p className="text-stone-500">
          {product.categoryName
            ? t("product.placeAndCategory", { location: product.locationName, category: product.categoryName })
            : product.locationName}
        </p>
        {status && (
          <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone[status].pill}`}>
            {t(`attention.${status}`)}
          </span>
        )}
      </header>

      <section className={`${raisedCard} flex items-center justify-between p-3 pl-5`}>
        <span className="flex flex-col">
          <span className="text-xs font-semibold text-stone-500">{t("product.stock")}</span>
          <span
            aria-live="polite"
            className={`font-display text-[34px] leading-none tabular-nums ${product.stock === 0 ? "text-stone-400" : ""}`}
          >
            {product.stock}
          </span>
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            disabled={product.stock === 0}
            onClick={() => changeStock(product, "use")}
            aria-label={t("koti.use", { name: product.name })}
            className={`${stepButton} h-12 w-12`}
          >
            <MinusIcon width={22} height={22} />
          </button>
          <button
            type="button"
            onClick={() => changeStock(product, "restock")}
            aria-label={t("koti.restock", { name: product.name })}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
          >
            <PlusIcon width={22} height={22} />
          </button>
        </span>
      </section>

      <ul className={group}>
        <Fact label={t(product.expiryKind ? `product.expiryKind.${product.expiryKind}` : "product.expiryKind")}>
          {!product.expiryKind ? (
            <span className="text-stone-400">{t("product.expiryKind.none")}</span>
          ) : product.expiryDate ? (
            <span className={status && status !== "runningLow" ? statusTone[status].text : ""}>
              {t("product.expiryDateAndDistance", {
                date: formatExpiryDate(product.expiryDate, lang),
                distance: relativeExpiry(product.expiryDate, today, lang),
              })}
            </span>
          ) : (
            <span className="text-stone-400">{t("product.noExpiryDate")}</span>
          )}
        </Fact>
        <Fact label={t("product.minimumStock")}>
          {product.minimumStock ?? <span className="text-stone-400">{t("product.minimumStockNone")}</span>}
        </Fact>
        <Fact label={t("product.onList")}>
          {onList ? (
            <Quantity entry={onList} />
          ) : (
            <button
              type="button"
              onClick={() => needMore(product)}
              className={`${textLink} -my-2 flex min-h-11 items-center gap-1`}
            >
              <PlusIcon width={16} height={16} strokeWidth={2.5} />
              {t("koti.addToList")}
            </button>
          )}
        </Fact>
      </ul>

      <section>
        <h2 className={groupHeader}>{t("activity.recent")}</h2>
        <ActivityList activities={activities} />
      </section>
    </>
  );
}

/** A line of the Product's facts: what it is on the left, its value on the right. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className={`${groupRow} flex min-h-12 items-center justify-between gap-3 px-4 py-1`}>
      <span className="text-stone-500">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </li>
  );
}

/** The Product's form: every field saves as it changes, so "Done" has nothing left to save. */
function EditProduct({ product, home }: { product: Product; home: string }) {
  const t = useT();
  const productId = product._id;
  const showUndoToast = useUndoToast();
  const inventory = useQuery(api.inventory.get);
  const rename = useMutation(api.products.rename);
  const update = useMutation(api.products.update).withOptimisticUpdate(setCategoryLocally);
  const remove = useMutation(api.products.remove);
  const restore = useMutation(api.products.restore);
  const showRunningLow = useRunningLowToast();

  // Raising the Minimum Stock up to the Stock makes the Product Running Low, which the toast says.
  const saveMinimumStock = async (minimumStock: number | null) => {
    const { crossedIntoRunningLow } = await update({ productId, minimumStock });
    if (crossedIntoRunningLow) showRunningLow(product);
  };

  const saveName = (name: string) => {
    if (name.trim() === "" || name.trim() === product.name) return;
    void rename({ productId, name });
  };

  const deleteProduct = async () => {
    navigate(home, { replace: true });
    const deleted = await remove({ productId });
    showUndoToast(t("product.deleted", { name: deleted.name }), () => void restore(deleted));
  };

  return (
    <>
      <div className={`${raisedCard} flex flex-col gap-5 p-4`}>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-stone-500">{t("product.name")}</span>
          <input
            // Remounts when the name changes elsewhere, so the field shows the latest name.
            key={product.name}
            defaultValue={product.name}
            onBlur={(event) => {
              if (event.target.value.trim() === "") event.target.value = product.name;
              saveName(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            enterKeyHint="done"
            autoComplete="off"
            className={`${fieldClass} text-lg font-semibold`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-stone-500">{t("product.homeLocation")}</span>
          <select
            value={product.locationId}
            onChange={(event) => void update({ productId, locationId: event.target.value as Id<"locations"> })}
            className={fieldClass}
          >
            {inventory?.map((location) => (
              <option key={location._id} value={location._id}>
                {location.name}
              </option>
            )) ?? <option value={product.locationId}>{product.locationName}</option>}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-stone-500">{t("product.category")}</span>
          <CategorySelect
            value={product.categoryId}
            onChange={(categoryId) => void update({ productId, categoryId })}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-stone-500">{t("product.minimumStock")}</span>
          <input
            // Remounts when the Minimum Stock changes elsewhere, so the field shows the latest value.
            key={product.minimumStock ?? "none"}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={product.minimumStock ?? ""}
            placeholder={t("product.minimumStockNone")}
            onBlur={(event) => {
              const text = event.target.value.trim();
              const minimumStock = text === "" ? null : Number(text);
              if (minimumStock !== null && !(Number.isInteger(minimumStock) && minimumStock >= 0)) {
                event.target.value = String(product.minimumStock ?? "");
                return;
              }
              if (minimumStock !== product.minimumStock) void saveMinimumStock(minimumStock);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            enterKeyHint="done"
            className={fieldClass}
          />
          <span className="text-xs text-stone-500">{t("product.minimumStockHint")}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-stone-500">{t("product.expiryKind")}</span>
          <ExpiryKindSelect
            value={product.expiryKind}
            onChange={(expiryKind) => void update({ productId, expiryKind })}
            className={fieldClass}
          />
        </label>
        {product.expiryKind && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-stone-500">{t("product.expiryDate")}</span>
            <input
              // Remounts when the date changes elsewhere, so the field shows the latest date.
              key={product.expiryDate ?? "none"}
              type="date"
              defaultValue={product.expiryDate ?? ""}
              // A picked date saves straight away; an emptied field clears the date once it loses focus.
              onChange={(event) => {
                const expiryDate = event.target.value;
                if (isDate(expiryDate) && expiryDate !== product.expiryDate) void update({ productId, expiryDate });
              }}
              onBlur={(event) => {
                if (event.target.value === "" && product.expiryDate) void update({ productId, expiryDate: null });
              }}
              className={fieldClass}
            />
            <span className="text-xs text-stone-500">{t("product.expiryDateHint")}</span>
          </label>
        )}
      </div>
      <Barcodes barcodes={product.barcodes} />
      <button
        type="button"
        onClick={() => void deleteProduct()}
        className={`${secondaryButton} mt-4 py-3 text-lg text-red-700 dark:text-red-400`}
      >
        {t("product.delete")}
      </button>
    </>
  );
}

/** The Product's Barcodes; removing a wrong one can be undone. */
function Barcodes({ barcodes }: { barcodes: { _id: Id<"barcodes">; code: string }[] }) {
  const t = useT();
  const showUndoToast = useUndoToast();
  const remove = useMutation(api.barcodes.remove);
  const link = useMutation(api.barcodes.link);

  const removeBarcode = async (barcodeId: Id<"barcodes">) => {
    const removed = await remove({ barcodeId });
    showUndoToast(t("product.barcodeRemoved", { code: removed.code }), () => void link(removed));
  };

  return (
    <section className="flex flex-col gap-1">
      <h2 className={groupHeader}>{t("product.barcodes")}</h2>
      {barcodes.length === 0 && <p className={`${card} px-4 py-3 text-sm text-stone-500`}>{t("product.noBarcodes")}</p>}
      {barcodes.length > 0 && (
        <ul className={`${cardList} flex flex-col`}>
          {barcodes.map((barcode) => (
            <li key={barcode._id} className="flex items-center justify-between gap-2 pl-4">
              <span className="font-mono tabular-nums">{barcode.code}</span>
              <button
                type="button"
                onClick={() => void removeBarcode(barcode._id)}
                aria-label={t("product.removeBarcode", { code: barcode.code })}
                className="flex h-11 w-11 items-center justify-center text-stone-500"
              >
                <TrashIcon width={20} height={20} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
