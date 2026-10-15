"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { ActivityList } from "@/components/ActivityList";
import { useNeedMore } from "@/components/NeedMore";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";

const fieldClass = "min-h-11 w-full rounded-xl border border-zinc-300 bg-background px-4 py-2 text-base dark:border-zinc-700";

/**
 * Everything about one Product: rename it, move it to another Home Location,
 * set or clear its Minimum Stock, put it on the Shopping List, delete it, and
 * see its recent Activity.
 */
export default function ProductPage({ params }: PageProps<"/koti/[productId]">) {
  const productId = use(params).productId as Id<"products">;
  const t = useT();
  const router = useRouter();
  const showUndoToast = useUndoToast();
  const product = useQuery(api.products.get, { productId });
  const inventory = useQuery(api.inventory.get);
  const activities = useQuery(api.activities.forProduct, { productId });
  const rename = useMutation(api.products.rename);
  const update = useMutation(api.products.update);
  const remove = useMutation(api.products.remove);
  const restore = useMutation(api.products.restore);
  const needMore = useNeedMore();

  if (product === undefined) return <p className="text-zinc-500">{t("common.loading")}</p>;
  if (product === null) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <p className="text-zinc-500">{t("product.notFound")}</p>
      </div>
    );
  }

  const saveName = (name: string) => {
    if (name.trim() === "" || name.trim() === product.name) return;
    void rename({ productId, name });
  };

  const deleteProduct = async () => {
    router.replace("/koti");
    const deleted = await remove({ productId });
    showUndoToast(t("product.deleted", { name: deleted.name }), () => void restore(deleted));
  };

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">{t("product.name")}</span>
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
        <span className="text-sm text-zinc-500">{t("product.homeLocation")}</span>
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
      <div className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">{t("product.stock")}</span>
        <p className={`text-2xl font-semibold tabular-nums ${product.stock === 0 ? "text-zinc-400" : ""}`}>
          {product.stock}
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">{t("product.minimumStock")}</span>
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
            if (minimumStock !== product.minimumStock) void update({ productId, minimumStock });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          enterKeyHint="done"
          className={fieldClass}
        />
        <span className="text-xs text-zinc-500">{t("product.minimumStockHint")}</span>
      </label>
      <button
        type="button"
        onClick={() => void needMore(productId)}
        className="rounded-xl bg-foreground py-3 text-lg font-semibold text-background"
      >
        {t("lista.needMore")}
      </button>
      <button
        type="button"
        onClick={() => void deleteProduct()}
        className="mt-4 rounded-xl border border-zinc-300 py-3 text-lg font-semibold text-red-600 dark:border-zinc-700"
      >
        {t("product.delete")}
      </button>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm text-zinc-500">{t("activity.recent")}</h2>
        <ActivityList activities={activities} />
      </section>
    </div>
  );
}

function BackLink() {
  const t = useT();
  return (
    <Link href="/koti" className="-my-2 self-start py-2 text-zinc-600 dark:text-zinc-300">
      {t("nav.back")}
    </Link>
  );
}
