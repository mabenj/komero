"use client";

import { useMutation, useQuery } from "convex/react";
import { BackLink, navigate } from "@/components/AppLink";
import { ActivityList } from "@/components/ActivityList";
import { CategorySelect } from "@/components/CategorySelect";
import { ExpiryKindSelect } from "@/components/ExpiryKindSelect";
import { TrashIcon } from "@/components/icons";
import { useNeedMore } from "@/components/NeedMore";
import { useRunningLowToast } from "@/components/StockToasts";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { isDate } from "@/convex/stock";
import { useT } from "@/lib/i18n";
import { setCategoryLocally } from "@/lib/listUpdates";
import { card, cardList, field, primaryButton, secondaryButton } from "@/lib/styles";

const fieldClass = `${field} w-full px-4 py-2`;

/**
 * Everything about one Product: rename it, move it to another Location, set,
 * change or clear its Category, set or clear its Minimum Stock, Expiry Kind
 * and Expiry Date, put it on the Shopping List, delete it, and see its recent
 * Activity.
 */
export default function ProductScreen({ productId }: { productId: Id<"products"> }) {
  const t = useT();
  const showUndoToast = useUndoToast();
  const product = useQuery(api.products.get, { productId });
  const inventory = useQuery(api.inventory.get);
  const activities = useQuery(api.activities.forProduct, { productId });
  const rename = useMutation(api.products.rename);
  const update = useMutation(api.products.update).withOptimisticUpdate(setCategoryLocally);
  const remove = useMutation(api.products.remove);
  const restore = useMutation(api.products.restore);
  const needMore = useNeedMore();
  const showRunningLow = useRunningLowToast();

  if (product === undefined) return <p className="text-stone-500">{t("common.loading")}</p>;
  if (product === null) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-stone-500">{t("product.notFound")}</p>
      </div>
    );
  }

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
    navigate("/koti", { replace: true });
    const deleted = await remove({ productId });
    showUndoToast(t("product.deleted", { name: deleted.name }), () => void restore(deleted));
  };

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <div className={`${card} flex flex-col gap-5 p-4`}>
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
        <div className="flex flex-col gap-1">
          <span className="text-sm text-stone-500">{t("product.stock")}</span>
          <p className={`text-2xl font-semibold tabular-nums ${product.stock === 0 ? "text-stone-400" : ""}`}>
            {product.stock}
          </p>
        </div>
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
        onClick={() => needMore(product)}
        className={`${primaryButton} py-3 text-lg`}
      >
        {t("lista.needMore")}
      </button>
      <button
        type="button"
        onClick={() => void deleteProduct()}
        className={`${secondaryButton} mt-4 py-3 text-lg text-red-700 dark:text-red-400`}
      >
        {t("product.delete")}
      </button>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm text-stone-500">{t("activity.recent")}</h2>
        <ActivityList activities={activities} />
      </section>
    </div>
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
      <h2 className="text-sm text-stone-500">{t("product.barcodes")}</h2>
      {barcodes.length === 0 && <p className="text-sm text-stone-500">{t("product.noBarcodes")}</p>}
      {barcodes.length > 0 && (
        <ul className={`${cardList} flex flex-col`}>
          {barcodes.map((barcode) => (
            <li key={barcode._id} className="flex items-center justify-between gap-2 pl-3">
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
