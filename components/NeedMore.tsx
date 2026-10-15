"use client";

import { useConvex, useMutation } from "convex/react";
import { type PointerEvent, type ReactNode, useCallback, useRef, useState } from "react";
import { useUndoToast } from "@/components/UndoToast";
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
 * and undo, which waits for the server's Entry if it hasn't arrived yet.
 */
export function useNeedMoreToast() {
  const t = useT();
  const showUndoToast = useUndoToast();
  const setQuantity = useMutation(api.shoppingList.setQuantity);
  const remove = useMutation(api.shoppingList.remove);

  return useCallback(
    (shown: { name: string; quantity: number }, added: Added | Promise<Added>) => {
      showUndoToast(t("lista.onList", shown), async () => {
        const { entryId, quantity } = await added;
        if (quantity === 1) void remove({ entryId });
        else void setQuantity({ entryId, quantity: quantity - 1 });
      });
    },
    [setQuantity, remove, showUndoToast, t],
  );
}

const SWIPE_DISTANCE = 80;

/**
 * A Koti row that does Need More when swiped left. Vertical scrolling still
 * works, and a swipe doesn't count as a tap on the row.
 */
export function SwipeToNeedMore({ product, children }: { product: Product; children: ReactNode }) {
  const t = useT();
  const needMore = useNeedMore();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    start.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    // A mostly vertical gesture is a scroll, not a swipe.
    if (offset === 0 && Math.abs(dy) > Math.abs(dx)) {
      start.current = null;
      setDragging(false);
      return;
    }
    setOffset(Math.min(0, Math.max(dx, -SWIPE_DISTANCE * 1.5)));
  };
  const onPointerEnd = () => {
    if (offset <= -SWIPE_DISTANCE) needMore(product);
    swiped.current = offset < -8;
    start.current = null;
    setDragging(false);
    setOffset(0);
  };

  return (
    <li className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-end px-4 text-sm font-semibold ${
          offset <= -SWIPE_DISTANCE ? "bg-accent text-accent-foreground" : "bg-accent/15 text-accent"
        }`}
      >
        {t("lista.needMore")}
      </div>
      <div
        className="relative flex min-h-14 items-center gap-3 bg-surface px-4 py-1.5"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 150ms",
          touchAction: "pan-y",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(event) => {
          if (!swiped.current) return;
          event.preventDefault();
          event.stopPropagation();
          swiped.current = false;
        }}
      >
        {children}
      </div>
    </li>
  );
}
