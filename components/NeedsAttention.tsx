"use client";

import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { AppLink } from "@/components/AppLink";
import { useSectionMotion } from "@/components/motion";
import { api } from "@/convex/_generated/api";
import type { AttentionStatus } from "@/convex/stock";
import { localToday } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { card } from "@/lib/styles";

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
 * Product page. Hidden when nothing needs attention; it fades in and out, and
 * Koti below it slides to make room.
 */
export function NeedsAttention() {
  const t = useT();
  const products = useQuery(api.inventory.needsAttention, { today: localToday() });
  const sectionMotion = useSectionMotion();

  return (
    <AnimatePresence initial={false}>
      {products && products.length > 0 && (
        <motion.section key="attention" {...sectionMotion} aria-label={t("attention.title")}>
          <ul className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-1 pb-3">
            {products.map((product) => (
              <li key={product._id} className="shrink-0 snap-start">
                <AppLink href={`/koti/${product._id}`} className={`${card} flex min-h-11 items-center gap-2 px-3 py-2`}>
                  <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${dots[product.attention]}`} />
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
  );
}
