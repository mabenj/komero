"use client";

// An Entry's controls shared by a One-off's sheet on Kauppalista and a Product page.
import { useMutation } from "convex/react";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { useChangeToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";
import { removeLocally } from "@/lib/listUpdates";
import { stepButton } from "@/lib/styles";

/** How many of an Entry to buy, with – and + (never below one). */
export function QuantityStepper({
  entry,
  label,
  setQuantity,
}: {
  entry: { _id: Id<"entries">; name: string; quantity: number };
  label: string;
  setQuantity: (args: { entryId: Id<"entries">; quantity: number }) => Promise<unknown>;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 font-semibold">{label}</span>
      <button
        type="button"
        className={stepButton}
        disabled={entry.quantity <= 1}
        onClick={() => void setQuantity({ entryId: entry._id, quantity: entry.quantity - 1 })}
        aria-label={t("lista.decrease", { name: entry.name })}
      >
        <MinusIcon width={18} height={18} />
      </button>
      <span className="min-w-8 text-center font-display text-lg tabular-nums">
        {t("lista.quantity", { quantity: entry.quantity })}
      </span>
      <button
        type="button"
        className={stepButton}
        onClick={() => void setQuantity({ entryId: entry._id, quantity: entry.quantity + 1 })}
        aria-label={t("lista.increase", { name: entry.name })}
      >
        <PlusIcon width={18} height={18} />
      </button>
    </div>
  );
}

/** Deletes an Entry from the list at once, with a toast that can bring it back. */
export function useDeleteEntry() {
  const t = useT();
  const showChangeToast = useChangeToast();
  const remove = useMutation(api.shoppingList.remove).withOptimisticUpdate(removeLocally);
  const restore = useMutation(api.shoppingList.restore);
  return (entry: { _id: Id<"entries">; name: string; quantity: number; productId?: Id<"products"> }) => {
    const deleted = { productId: entry.productId, name: entry.name, quantity: entry.quantity };
    showChangeToast(t("lista.deleted", { name: entry.name }), remove({ entryId: entry._id }), () => restore(deleted));
  };
}
