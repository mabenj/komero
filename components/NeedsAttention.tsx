"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { useNeedMore } from "@/components/NeedMore";
import { api } from "@/convex/_generated/api";
import { localToday } from "@/lib/dates";
import { useT } from "@/lib/i18n";

/**
 * The top of Koti: Products that need attention on the phone's date, most
 * urgent first, with a count that stays visible when collapsed. Hidden when
 * nothing needs attention.
 */
export function NeedsAttention() {
  const t = useT();
  const products = useQuery(api.inventory.needsAttention, { today: localToday() });
  const needMore = useNeedMore();
  const [open, setOpen] = useState(true);

  if (!products || products.length === 0) return null;

  return (
    <section className="rounded-xl bg-amber-50 px-3 dark:bg-amber-950/40">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="text-lg font-semibold">{t("attention.title")}</h2>
        <span className="flex items-center gap-2">
          <span className="min-w-6 rounded-full bg-amber-500 px-2 text-center text-sm font-semibold text-white tabular-nums">
            {products.length}
          </span>
          <ChevronDownIcon
            width={20}
            height={20}
            aria-hidden="true"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && (
        <ul className="flex flex-col divide-y divide-amber-200 pb-1 dark:divide-amber-900">
          {products.map((product) => (
            <li key={product._id} className="flex items-center gap-3 py-1.5">
              <Link href={`/koti/${product._id}`} className="min-h-11 min-w-0 flex-1 content-center">
                <p className="truncate">{product.name}</p>
                <p
                  className={`truncate text-xs ${product.attention === "expired" ? "font-semibold text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}
                >
                  {t("attention.detail", {
                    status: t(`attention.${product.attention}`),
                    location: product.locationName,
                    stock: product.stock,
                  })}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => void needMore(product._id)}
                className="min-h-11 shrink-0 rounded-full bg-foreground px-4 text-sm font-semibold text-background"
              >
                {t("lista.needMore")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
