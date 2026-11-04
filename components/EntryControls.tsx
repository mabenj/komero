"use client";

// An Entry's controls shared by Kauppalista (on the list and in the Bag) and a Product page.
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MinusIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { useChangeToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";
import { removeLocally, setQuantityLocally } from "@/lib/listUpdates";

type Entry = { _id: Id<"entries">; name: string; quantity: number; productId?: Id<"products"> };

// How long the open stepper waits for another tap before it closes.
const CLOSE_AFTER_MS = 3500;

/**
 * How many of an Entry to buy: a "×2" pill (a faint "×1" when it's just one)
 * that opens into − 2 + where it sits. It closes after a few idle seconds, on
 * Escape, or on a tap anywhere else. At one the − is a bin, which deletes the
 * Entry with an undo toast.
 */
export function Quantity({ entry }: { entry: Entry }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const setQuantity = useMutation(api.shoppingList.setQuantity).withOptimisticUpdate(setQuantityLocally);
  const deleteEntry = useDeleteEntry();
  const { quantity } = entry;

  const close = useCallback(() => {
    if (!root.current?.contains(document.activeElement)) return setOpen(false);
    // Focus inside goes back to the pill, so a keyboard doesn't lose its place.
    flushSync(() => setOpen(false));
    pill.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(close, CLOSE_AFTER_MS);
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", outside);
    };
    // A change of quantity starts the wait again.
  }, [open, quantity, close]);

  const change = (to: number) => void setQuantity({ entryId: entry._id, quantity: to });

  return (
    <div
      ref={root}
      className="flex shrink-0 items-center"
      onKeyDown={(event) => {
        if (open && event.key === "Escape") close();
      }}
    >
      {open ? (
        <div className="flex items-center rounded-full bg-stone-100"
        >
          <button
            type="button"
            onClick={() => {
              if (quantity > 1) return change(quantity - 1);
              setOpen(false);
              deleteEntry(entry);
            }}
            aria-label={t(quantity > 1 ? "lista.decrease" : "lista.delete", { name: entry.name })}
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              quantity > 1 ? "text-stone-600 dark:text-stone-300" : "text-red-600 dark:text-red-400"
            }`}
          >
            {quantity > 1 ? <MinusIcon width={16} height={16} strokeWidth={2.5} /> : <TrashIcon width={16} height={16} />}
          </button>
          <span aria-live="polite" className="min-w-6 text-center font-display text-base tabular-nums">
            {quantity}
          </span>
          <button
            type="button"
            // Opened from the keyboard, the stepper takes the focus the pill had.
            autoFocus
            onClick={() => change(quantity + 1)}
            aria-label={t("lista.increase", { name: entry.name })}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground"
          >
            <PlusIcon width={16} height={16} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <button
          ref={pill}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("lista.quantityOf", { name: entry.name, quantity })}
          className="-mr-1 flex h-11 items-center px-1"
        >
          <span
            className={`rounded-full px-2.5 py-0.5 font-display text-sm tabular-nums ${
              quantity > 1 ? "bg-accent/12 text-accent" : "bg-stone-100 text-stone-400"
            }`}
          >
            {t("lista.quantity", { quantity })}
          </span>
        </button>
      )}
    </div>
  );
}

/** Deletes an Entry from the list at once, with a toast that can bring it back. */
export function useDeleteEntry() {
  const t = useT();
  const showChangeToast = useChangeToast();
  const remove = useMutation(api.shoppingList.remove).withOptimisticUpdate(removeLocally);
  const restore = useMutation(api.shoppingList.restore);
  return (entry: Entry) => {
    const deleted = { productId: entry.productId, name: entry.name, quantity: entry.quantity };
    showChangeToast(t("lista.deleted", { name: entry.name }), remove({ entryId: entry._id }), () => restore(deleted));
  };
}
