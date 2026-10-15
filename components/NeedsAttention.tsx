"use client";

import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { AppLink, navigate } from "@/components/AppLink";
import { useSectionMotion } from "@/components/motion";
import { useNeedMore } from "@/components/NeedMore";
import { Sheet } from "@/components/Sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AttentionStatus } from "@/convex/stock";
import { localToday } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { quantityAfterNeedMore } from "@/lib/listUpdates";
import { card, primaryButton, secondaryButton } from "@/lib/styles";

type Product = { _id: Id<"products">; name: string };

const dots: Record<AttentionStatus, string> = {
  expired: "bg-red-600",
  checkIt: "bg-amber-500",
  expiringSoon: "bg-amber-400",
  runningLow: "bg-stone-400",
};

/** Status text: red for expired, amber for check it or expiring soon, grey otherwise (also on Koti's rows). */
export const statusText: Record<AttentionStatus, string> = {
  expired: "font-semibold text-red-700 dark:text-red-400",
  checkIt: "text-amber-700 dark:text-amber-400",
  expiringSoon: "text-amber-700 dark:text-amber-400",
  runningLow: "text-stone-500",
};

/**
 * The top of Koti: a row of chips, scrolled sideways, for the Products that
 * need attention on the phone's date, most urgent first. A chip opens the
 * Product page, except a Running Low one, which asks to do Need More first.
 * Hidden when nothing needs attention; it fades in and out, and Koti below it
 * slides to make room.
 */
export function NeedsAttention() {
  const t = useT();
  const products = useQuery(api.inventory.needsAttention, { today: localToday() });
  const sectionMotion = useSectionMotion();
  const [asking, setAsking] = useState<Product | null>(null);

  return (
    <>
      <AnimatePresence initial={false}>
        {products && products.length > 0 && (
          <motion.section key="attention" {...sectionMotion} aria-label={t("attention.title")}>
            <ul className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-1 pb-3">
              {products.map((product) => (
                <li key={product._id} className="shrink-0 snap-start">
                  <AppLink
                    href={`/koti/${product._id}`}
                    onClick={(event) => {
                      if (product.attention !== "runningLow") return;
                      event.preventDefault();
                      setAsking(product);
                    }}
                    className={`${card} flex min-h-11 items-center gap-2 px-3 py-2`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${dots[product.attention]}`}
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">{product.name}</span>
                      <span className={`text-xs ${statusText[product.attention]}`}>
                        {t(`attention.${product.attention}`)}
                      </span>
                    </span>
                  </AppLink>
                </li>
              ))}
            </ul>
          </motion.section>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {asking && <AskNeedMore key={asking._id} product={asking} onClose={() => setAsking(null)} />}
      </AnimatePresence>
    </>
  );
}

/** Asks whether to put a Running Low Product on the Shopping List, saying if it's there already. */
function AskNeedMore({ product, onClose }: { product: Product; onClose: () => void }) {
  const t = useT();
  const needMore = useNeedMore();
  const list = useQuery(api.shoppingList.get, {});
  const onList = quantityAfterNeedMore(list, product._id) - 1;

  return (
    <Sheet title={t("attention.askNeedMore", { name: product.name })} onClose={onClose}>
      {onList > 0 && <p className="text-stone-500">{t("attention.alreadyOnList", { quantity: onList })}</p>}
      <button
        type="button"
        onClick={() => {
          needMore(product);
          onClose();
        }}
        className={`${primaryButton} py-3 text-lg`}
      >
        {t("koti.addToList")}
      </button>
      <button
        type="button"
        onClick={() => {
          onClose();
          navigate(`/koti/${product._id}`);
        }}
        className={`${secondaryButton} py-3 text-lg`}
      >
        {t("attention.openProduct")}
      </button>
    </Sheet>
  );
}
