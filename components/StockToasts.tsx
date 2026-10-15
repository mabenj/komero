"use client";

import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useCallback } from "react";
import { useNeedMore } from "@/components/NeedMore";
import { type ShownToast, useChangeToast, useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";

type Product = { _id: Id<"products">; name: string };
type StockChange = { from: number; to: number; expiryDateBefore?: string };
type PutAway = FunctionArgs<typeof api.shoppingList.undoPutAway>["putAway"];

/**
 * The "running low" toast for a change that made a Product Running Low:
 * "Add to list" does Need More, and ignoring it adds nothing. `undo` undoes
 * the change. Given the change's own toast, it takes that toast's place, if
 * no newer one has.
 */
export function useRunningLowToast() {
  const t = useT();
  const showUndoToast = useUndoToast();
  const needMore = useNeedMore();

  return useCallback(
    (product: Product, undo?: () => void, replacing?: ShownToast) =>
      (replacing?.replace ?? showUndoToast)(t("koti.runningLow", { name: product.name }), undo, {
        label: t("koti.addToList"),
        run: () => needMore(product),
      }),
    [showUndoToast, needMore, t],
  );
}

/**
 * The undo for a + / – or a scan: puts Stock and the Expiry Date back, and
 * shows the "running low" toast if that makes the Product Running Low.
 */
export function useUndoStockChange() {
  const undoStockChange = useMutation(api.products.undoStockChange);
  const showRunningLow = useRunningLowToast();

  return useCallback(
    (product: Product, { from, to, expiryDateBefore }: StockChange) =>
      async () => {
        const undone = await undoStockChange({ productId: product._id, from, to, expiryDateBefore });
        if (undone.crossedIntoRunningLow) showRunningLow(product);
      },
    [undoStockChange, showRunningLow],
  );
}

/**
 * A toast after Put Away (one Entry, the whole Bag, or a scan) whose undo puts
 * it all back in the Bag. Shown at the tap, its undo waits for what the server
 * put away; if Put Away fails, the toast goes away.
 */
export function usePutAwayToast() {
  const showChangeToast = useChangeToast();
  const undoPutAway = useMutation(api.shoppingList.undoPutAway);

  return useCallback(
    (message: string, putAway: PutAway | Promise<PutAway>) =>
      showChangeToast(message, putAway, (done) => undoPutAway({ putAway: done })),
    [showChangeToast, undoPutAway],
  );
}
