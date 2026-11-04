"use client";

// An Entry's controls shared by Kauppalista (on the list and in the Bag) and a Product page.
import { useMutation } from "convex/react";
import { TrashIcon } from "@/components/icons";
import { Stepper } from "@/components/Stepper";
import { useChangeToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";
import { removeLocally, setQuantityLocally } from "@/lib/listUpdates";

type Entry = {
  _id: Id<"entries">;
  name: string;
  quantity: number;
  productId?: Id<"products">;
  categoryId?: Id<"categories"> | null;
};

/**
 * How many of an Entry to buy: a "×2" pill (a faint "×1" when it's just one)
 * that opens into − 2 + where it sits. At one the − is a bin, which deletes
 * the Entry with an undo toast.
 */
export function Quantity({ entry }: { entry: Entry }) {
  const t = useT();
  const setQuantity = useMutation(api.shoppingList.setQuantity).withOptimisticUpdate(setQuantityLocally);
  const deleteEntry = useDeleteEntry();
  const { quantity } = entry;
  const change = (to: number) => void setQuantity({ entryId: entry._id, quantity: to });

  return (
    <Stepper
      value={quantity}
      pillLabel={t("lista.quantityOf", { name: entry.name, quantity })}
      pill={
        <span
          className={`rounded-full px-2.5 py-0.5 font-display text-sm tabular-nums ${
            quantity > 1 ? "bg-accent/12 text-accent" : "bg-stone-100 text-stone-400"
          }`}
        >
          {t("lista.quantity", { quantity })}
        </span>
      }
      decrease={
        quantity > 1
          ? { label: t("lista.decrease", { name: entry.name }), onClick: () => change(quantity - 1) }
          : {
              label: t("lista.delete", { name: entry.name }),
              onClick: () => deleteEntry(entry),
              icon: <TrashIcon width={16} height={16} />,
              closes: true,
            }
      }
      increase={{ label: t("lista.increase", { name: entry.name }), onClick: () => change(quantity + 1) }}
    />
  );
}

/** Deletes an Entry from the list at once, with a toast that can bring it back. */
export function useDeleteEntry() {
  const t = useT();
  const showChangeToast = useChangeToast();
  const remove = useMutation(api.shoppingList.remove).withOptimisticUpdate(removeLocally);
  const restore = useMutation(api.shoppingList.restore);
  return (entry: Entry) => {
    const deleted = {
      productId: entry.productId,
      name: entry.name,
      quantity: entry.quantity,
      categoryId: entry.categoryId ?? undefined,
    };
    showChangeToast(t("lista.deleted", { name: entry.name }), remove({ entryId: entry._id }), () => restore(deleted));
  };
}
