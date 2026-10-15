"use client";

import { useConvex, useMutation } from "convex/react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { type PointerEvent, type ReactNode, useCallback, useRef, useState } from "react";
import { crossFade, swipeBack, useRowMotion } from "@/components/motion";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { haptic } from "@/lib/haptics";
import { useT } from "@/lib/i18n";
import { needMoreLocally, quantityAfterNeedMore } from "@/lib/listUpdates";
import { type PointerSample, readSwipe, type Swipe } from "@/lib/swipe";

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

const sample = (event: PointerEvent): PointerSample => ({ x: event.clientX, y: event.clientY, t: event.timeStamp });

/**
 * A Koti row that does Need More when swiped left (see `lib/swipe`). It
 * follows the finger, shows the moment letting go would do Need More with a
 * haptic, and springs back at the speed it was let go. Vertical scrolling still
 * works, and a swipe doesn't count as a tap on the row. In `AnimatePresence`,
 * the row slides in when added and out when deleted.
 */
export function SwipeToNeedMore({ product, children }: { product: Product; children: ReactNode }) {
  const t = useT();
  const needMore = useNeedMore();
  const rowMotion = useRowMotion();
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const opacity = useMotionValue(1);
  const gesture = useRef<{ samples: PointerSample[]; from: number } | null>(null);
  const swiped = useRef(false);
  const armed = useRef(false);
  const [showArmed, setShowArmed] = useState(false);

  const arm = (commits: boolean) => {
    if (commits === armed.current) return;
    armed.current = commits;
    setShowArmed(commits);
    if (commits) haptic();
  };

  const springBack = (velocity: number) => {
    if (x.get() === 0) return;
    if (!reduced) {
      void animate(x, 0, { ...swipeBack, velocity });
      return;
    }
    void animate(opacity, 0, crossFade).then(() => {
      if (gesture.current) return;
      x.set(0);
      void animate(opacity, 1, crossFade);
    });
  };

  const end = (swipe: Swipe | null) => {
    gesture.current = null;
    arm(false);
    if (swipe?.commits) needMore(product);
    springBack(swipe?.velocity ?? 0);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    // Catch the row where it is, if it's still springing back.
    x.stop();
    opacity.stop();
    opacity.set(1);
    gesture.current = { samples: [sample(event)], from: x.get() };
    swiped.current = false;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current) return;
    current.samples.push(sample(event));
    const swipe = readSwipe(current.samples, current.from);
    if (swipe.lock === "scroll") return end(null);
    if (swipe.lock === "swipe" && !swiped.current) {
      swiped.current = true;
      // Only now, so a tap still reaches the link or button it was on.
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    x.set(swipe.offset);
    arm(swipe.commits);
  };
  const onPointerUp = (event: PointerEvent) => {
    const current = gesture.current;
    if (!current) return;
    current.samples.push(sample(event));
    end(readSwipe(current.samples, current.from));
  };
  const onPointerCancel = () => {
    if (gesture.current) end(null);
  };

  return (
    <motion.li {...rowMotion} className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className={`absolute inset-0 flex items-center justify-end px-4 text-sm font-semibold transition-colors ${
          showArmed ? "bg-accent text-accent-foreground" : "bg-accent/15 text-accent"
        }`}
      >
        <motion.span className="inline-block" animate={{ scale: showArmed ? 1.1 : 1 }}>{t("lista.needMore")}</motion.span>
      </div>
      <motion.div
        className="relative flex min-h-14 items-center gap-3 bg-surface px-4 py-1.5"
        style={{ x, opacity, touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(event) => {
          if (!swiped.current) return;
          event.preventDefault();
          event.stopPropagation();
          swiped.current = false;
        }}
      >
        {children}
      </motion.div>
    </motion.li>
  );
}
