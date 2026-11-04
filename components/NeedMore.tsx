"use client";

import { useConvex, useMutation } from "convex/react";
import { useCallback } from "react";
import { useChangeToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";
import { needMoreLocally, quantityAfterNeedMore } from "@/lib/listUpdates";

type Product = { _id: Id<"products">; name: string };
type Added = { entryId: Id<"entries">; quantity: number };

/**
 * Need More, shown on the list at once (even offline), with a toast saying
 * how many are now on the list, which can undo it.
 */
export function useNeedMore() {
  const convex = useConvex();
  const needMore = useMutation(api.shoppingList.needMore).withOptimisticUpdate(needMoreLocally);
  const showNeedMoreToast = useNeedMoreToast();

  return useCallback(
    (product: Product) => {
      const list = convex.watchQuery(api.shoppingList.get, {}).localQueryResult();
      const quantity = quantityAfterNeedMore(list, product._id);
      showNeedMoreToast({ name: product.name, quantity }, needMore({ productId: product._id }));
    },
    [convex, needMore, showNeedMoreToast],
  );
}

/**
 * The toast after Need More (also from a scan): how many are now on the list,
 * and undo, which waits for the server's Entry if it hasn't arrived yet. If
 * Need More fails, the toast goes away.
 */
export function useNeedMoreToast() {
  const t = useT();
  const showChangeToast = useChangeToast();
  const setQuantity = useMutation(api.shoppingList.setQuantity);
  const remove = useMutation(api.shoppingList.remove);

  return useCallback(
    (shown: { name: string; quantity: number }, added: Added | Promise<Added>) => {
      showChangeToast(t("lista.onList", shown), added, ({ entryId, quantity }) =>
        quantity === 1 ? remove({ entryId }) : setQuantity({ entryId, quantity: quantity - 1 }),
      );
    },
    [setQuantity, remove, showChangeToast, t],
  );
}
