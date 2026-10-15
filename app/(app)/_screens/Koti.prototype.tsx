"use client";
/* eslint-disable react/jsx-no-literals -- PROTOTYPE: draft copy, not yet in the dictionaries */

/**
 * PROTOTYPE (branch prototype/ui-personality), throwaway.
 * Three variants of Koti, switchable via ?variant=A|B|C (or "nyt" for today's Koti),
 * all on the agreed look: birch + lake blue, Fraunces titles, frosted bars.
 * They disagree on structure: how a Location and a row are laid out, and where
 * Needs Attention sits. Stock changes and Need More are stubbed in memory, so
 * no data changes. ?empty=1 shows the empty-Koti state with the cupboard.
 */
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { AppLink } from "@/components/AppLink";
import { ChevronDownIcon, MinusIcon, PlusIcon, ScanIcon } from "@/components/icons";
import { PrototypeSwitcher, setPrototypeParam, usePrototypeParam } from "@/components/PrototypeSwitcher";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import { expiryStatus } from "@/convex/stock";
import { formatDay, localToday } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";

type Inventory = FunctionReturnType<typeof api.inventory.get>;
type Product = Inventory[number]["products"][number];
type Attention = FunctionReturnType<typeof api.inventory.needsAttention>;
type Stub = ReturnType<typeof useStub>;

const VARIANTS = [
  { key: "B", name: "Etiketit" },
  { key: "A", name: "Hyllyt" },
  { key: "C", name: "Purkit" },
  { key: "nyt", name: "Nykyinen" },
];

const FONTS = ["bricolage", "nunito", "young", "system"];
const DARKS = ["graphite", "night", "black", "warm"];

const card = "rounded-2xl bg-surface shadow-[0_1px_2px_rgba(60,40,20,0.06),0_6px_20px_rgba(60,40,20,0.05)] dark:shadow-none";

export function KotiPrototype({ inventory, current }: { inventory: Inventory; current: React.ReactNode }) {
  const t = useT();
  const variant = usePrototypeParam("variant", "B");
  const font = usePrototypeParam("font", FONTS[0]);
  const dark = usePrototypeParam("dark", DARKS[0]);
  useEffect(() => {
    document.documentElement.dataset.font = font;
    document.documentElement.dataset.dark = dark;
  }, [font, dark]);
  const next = (list: string[], value: string) => list[(list.indexOf(value) + 1) % list.length];
  const empty = usePrototypeParam("empty", "") === "1";
  const attention = useQuery(api.inventory.needsAttention, { today: localToday() }) ?? [];
  const stub = useStub();
  const showUndoToast = useUndoToast();
  const sample = inventory.flatMap((location) => location.products)[0];

  const body =
    empty ? <EmptyKoti />
    : variant === "B" ? <VariantB inventory={inventory} attention={attention} stub={stub} />
    : variant === "C" ? <VariantC inventory={inventory} attention={attention} stub={stub} />
    : variant === "nyt" ? current
    : variant === "A" ? <VariantA inventory={inventory} attention={attention} stub={stub} />
    : <VariantB inventory={inventory} attention={attention} stub={stub} />;

  return (
    <>
      {body}
      <PrototypeSwitcher
        variants={VARIANTS}
        extras={[
          { label: `fontti: ${font}`, run: () => setPrototypeParam("font", next(FONTS, font)) },
          { label: `tumma: ${dark}`, run: () => setPrototypeParam("dark", next(DARKS, dark)) },
          {
            label: "toast",
            run: () => showUndoToast(t("koti.stockChanged", { name: sample?.name ?? "Maito", from: 2, to: 1 }), () => {}),
          },
          {
            label: "vähissä",
            run: () =>
              showUndoToast(t("koti.runningLow", { name: sample?.name ?? "Maito" }), () => {}, {
                label: t("koti.addToList"),
                run: () => {},
              }),
          },
          { label: "tyhjä", active: empty, run: () => setPrototypeParam("empty", empty ? null : "1") },
        ]}
      />
    </>
  );
}

function useStub() {
  const t = useT();
  const showUndoToast = useUndoToast();
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const shift = (id: string, by: number) => setDeltas((d) => ({ ...d, [id]: (d[id] ?? 0) + by }));

  const stockOf = (product: Product) => Math.max(0, product.stock + (deltas[product._id] ?? 0));
  const change = (product: Product, by: 1 | -1) => {
    const from = stockOf(product);
    const to = Math.max(0, from + by);
    if (from === to) return;
    shift(product._id, to - from);
    showUndoToast(t("koti.stockChanged", { name: product.name, from, to }), () => shift(product._id, from - to));
  };
  const needMore = (name: string) => showUndoToast(t("lista.onList", { name, quantity: 1 }), () => {});
  return { stockOf, change, needMore };
}

function SearchField() {
  const t = useT();
  return (
    <input
      type="search"
      placeholder={t("koti.search")}
      aria-label={t("koti.search")}
      className={`${card} w-full px-4 py-3 text-base placeholder:text-stone-400 focus:outline-2 focus:outline-accent`}
    />
  );
}

const badgeTones = {
  expired: "bg-red-600 text-white",
  checkIt: "bg-amber-400 text-amber-950",
  expiringSoon: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  none: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
};
const statusText = {
  expired: "text-red-700 dark:text-red-400 font-semibold",
  checkIt: "text-amber-700 dark:text-amber-400",
  expiringSoon: "text-amber-700 dark:text-amber-400",
  runningLow: "text-stone-600 dark:text-stone-400",
};
const statusDot = {
  expired: "bg-red-600",
  checkIt: "bg-amber-500",
  expiringSoon: "bg-amber-400",
  runningLow: "bg-stone-400",
};

function tone(product: Product) {
  if (!product.expiryKind || !product.expiryDate) return null;
  const status = expiryStatus({ stock: 1, expiryKind: product.expiryKind, expiryDate: product.expiryDate }, localToday());
  return status === "expired" || status === "checkIt" || status === "expiringSoon" ? status : "none";
}

function DateBadge({ product }: { product: Product }) {
  const lang = useLang();
  const t = tone(product);
  if (!t || !product.expiryDate) return null;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${badgeTones[t]}`}>
      {formatDay(product.expiryDate, lang)}
    </span>
  );
}

function Stepper({ product, stub, size = "h-11 w-11" }: { product: Product; stub: Stub; size?: string }) {
  const stock = stub.stockOf(product);
  const button = `flex ${size} shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 disabled:opacity-30 dark:bg-stone-800 dark:text-stone-200`;
  return (
    <>
      <button type="button" className={button} disabled={stock === 0} onClick={() => stub.change(product, -1)}>
        <MinusIcon width={18} height={18} />
      </button>
      <span className={`w-7 text-center tabular-nums ${stock === 0 ? "text-stone-400" : "font-semibold"}`}>{stock}</span>
      <button type="button" className={button} onClick={() => stub.change(product, 1)}>
        <PlusIcon width={18} height={18} />
      </button>
    </>
  );
}

/* ---------------- A · Hyllyt: one card per Location, rows with − n + ---------------- */

function VariantA({ inventory, attention, stub }: { inventory: Inventory; attention: Attention; stub: Stub }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-6">
      <SearchField />
      {attention.length > 0 && (
        <section className={`${card} px-4`}>
          <h2 className="flex min-h-12 items-center gap-2 font-display text-lg font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            {t("attention.title")}
            <span className="ml-auto text-sm font-semibold text-stone-500 tabular-nums">{attention.length}</span>
          </h2>
          <ul className="flex flex-col divide-y divide-stone-200/70 pb-1 dark:divide-stone-700/60">
            {attention.map((item) => (
              <li key={item._id} className="flex items-center gap-3 py-2">
                <AppLink href={`/koti/${item._id}`} className="min-w-0 flex-1">
                  <p className="truncate">{item.name}</p>
                  <p className={`truncate text-xs ${statusText[item.attention]}`}>
                    {t(`attention.${item.attention}`)} · {item.locationName}
                  </p>
                </AppLink>
                <button
                  type="button"
                  onClick={() => stub.needMore(item.name)}
                  className="min-h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground"
                >
                  {t("lista.needMore")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {inventory.map((location) => (
        <section key={location._id} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="font-display text-xl font-semibold">{location.name}</h2>
            <button type="button" className="min-h-11 px-1 text-sm font-semibold text-accent">
              {t("koti.quickAdd")}
            </button>
          </div>
          <ul className={`${card} flex flex-col divide-y divide-stone-200/70 px-4 dark:divide-stone-700/60`}>
            {location.products.length === 0 && <li className="py-3 text-sm text-stone-500">{t("koti.noProducts")}</li>}
            {location.products.map((product) => (
              <li key={product._id} className="flex items-center gap-2 py-1.5">
                <AppLink
                  href={`/koti/${product._id}`}
                  className={`min-h-11 min-w-0 flex-1 content-center truncate ${stub.stockOf(product) === 0 ? "text-stone-400" : ""}`}
                >
                  {product.name}
                </AppLink>
                <DateBadge product={product} />
                <Stepper product={product} stub={stub} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------- B · Etiketit: quiet rows, count as a tappable label, attention as chips ---------------- */

function VariantB({ inventory, attention, stub }: { inventory: Inventory; attention: Attention; stub: Stub }) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <SearchField />
      {attention.length > 0 && (
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
          {attention.map((item) => (
            <AppLink
              key={item._id}
              href={`/koti/${item._id}`}
              className={`${card} flex shrink-0 snap-start items-center gap-2 px-3 py-2`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${statusDot[item.attention]}`} />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{item.name}</span>
                <span className={`text-xs ${statusText[item.attention]}`}>{t(`attention.${item.attention}`)}</span>
              </span>
            </AppLink>
          ))}
        </div>
      )}
      {inventory.map((location) => (
        <section key={location._id} className="flex flex-col gap-1.5">
          <h2 className="flex items-baseline gap-2 px-1">
            <span className="font-display text-lg font-semibold">{location.name}</span>
            <span className="text-xs font-semibold tracking-wide text-stone-400 tabular-nums">
              {location.products.length}
            </span>
          </h2>
          <ul className={`${card} flex flex-col divide-y divide-stone-200/70 px-4 dark:divide-stone-700/60`}>
            {location.products.length === 0 && <li className="py-3 text-sm text-stone-500">{t("koti.noProducts")}</li>}
            {location.products.map((product) => {
              const stock = stub.stockOf(product);
              const status = tone(product);
              const isOpen = open === product._id;
              return (
                <li key={product._id} className="flex min-h-14 items-center gap-2 py-1.5">
                  <AppLink href={`/koti/${product._id}`} className="min-w-0 flex-1">
                    <p className={`truncate ${stock === 0 ? "text-stone-400" : ""}`}>{product.name}</p>
                    {status && product.expiryDate ? (
                      <p className={`text-xs tabular-nums ${status === "none" ? "text-stone-500" : statusText[status]}`}>
                        {t(`expiry.${product.expiryKind!}`, { date: formatDay(product.expiryDate, lang) })}
                      </p>
                    ) : stock === 0 ? (
                      <p className="text-xs text-stone-400">Loppu</p>
                    ) : null}
                  </AppLink>
                  {isOpen ? (
                    <div className="flex items-center gap-1 rounded-full bg-accent/10 p-1">
                      <Stepper product={product} stub={stub} size="h-10 w-10" />
                      <button
                        type="button"
                        onClick={() => setOpen(null)}
                        className="h-10 rounded-full px-3 text-sm font-semibold text-accent"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpen(product._id)}
                      className={`min-h-11 min-w-12 rounded-full px-3 font-display text-xl font-semibold tabular-nums ${
                        stock === 0 ? "text-stone-400 ring-1 ring-stone-300 dark:ring-stone-700" : "bg-stone-100 dark:bg-stone-800"
                      }`}
                    >
                      {stock}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------- C · Purkit: a grid of tiles per Location, the count big ---------------- */

function VariantC({ inventory, attention, stub }: { inventory: Inventory; attention: Attention; stub: Stub }) {
  const t = useT();
  const [attentionOpen, setAttentionOpen] = useState(false);
  return (
    <div className="flex flex-col gap-7">
      <SearchField />
      {attention.length > 0 && (
        <section className={`${card} overflow-hidden`}>
          <button
            type="button"
            onClick={() => setAttentionOpen(!attentionOpen)}
            className="flex min-h-13 w-full items-center gap-3 px-4 text-left"
          >
            <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-amber-400 px-2 text-sm font-bold text-amber-950 tabular-nums">
              {attention.length}
            </span>
            <span className="flex-1 font-display text-lg font-semibold">{t("attention.title")}</span>
            <ChevronDownIcon width={20} height={20} className={`transition-transform ${attentionOpen ? "rotate-180" : ""}`} />
          </button>
          {attentionOpen && (
            <ul className="flex flex-col divide-y divide-stone-200/70 border-t border-stone-200/70 px-4 dark:divide-stone-700/60 dark:border-stone-700/60">
              {attention.map((item) => (
                <li key={item._id} className="flex items-center gap-3 py-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDot[item.attention]}`} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className={`shrink-0 text-xs ${statusText[item.attention]}`}>{t(`attention.${item.attention}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {inventory.map((location) => (
        <section key={location._id} className="flex flex-col gap-3">
          <h2 className="px-1 font-display text-2xl font-semibold">{location.name}</h2>
          {location.products.length === 0 && <p className="px-1 text-sm text-stone-500">{t("koti.noProducts")}</p>}
          <ul className="grid grid-cols-2 gap-3">
            {location.products.map((product) => {
              const stock = stub.stockOf(product);
              const out = stock === 0;
              return (
                <li
                  key={product._id}
                  className={`relative flex flex-col gap-1 p-3 ${
                    out ? "rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700" : card
                  }`}
                >
                  <AppLink href={`/koti/${product._id}`} className="flex min-h-16 flex-col gap-1 pr-10">
                    <span className={`line-clamp-2 leading-snug font-medium ${out ? "text-stone-400" : ""}`}>
                      {product.name}
                    </span>
                  </AppLink>
                  <span className="absolute top-3 right-3">
                    <DateBadge product={product} />
                  </span>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      disabled={out}
                      onClick={() => stub.change(product, -1)}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 disabled:opacity-30 dark:bg-stone-800"
                    >
                      <MinusIcon width={18} height={18} />
                    </button>
                    <span className={`font-display text-4xl font-semibold tabular-nums ${out ? "text-stone-300 dark:text-stone-600" : ""}`}>
                      {stock}
                    </span>
                    <button
                      type="button"
                      onClick={() => stub.change(product, 1)}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800"
                    >
                      <PlusIcon width={18} height={18} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------- Empty Koti, with the cupboard ---------------- */

function EmptyKoti() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 pt-10 text-center">
      <Cupboard className="h-44 w-44 text-foreground" />
      <h2 className="font-display text-2xl font-semibold">Komero on vielä tyhjä</h2>
      <p className="text-stone-600 dark:text-stone-400">
        Lisää ensimmäinen tuote kirjoittamalla sen nimi, tai skannaa pakkauksen viivakoodi.
      </p>
      <AppLink
        href="/scan"
        className="mt-2 flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-accent-foreground"
      >
        <ScanIcon width={20} height={20} />
        Skannaa
      </AppLink>
    </div>
  );
}

/** The app icon's cupboard; its doors swing open once. */
export function Cupboard({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
        {/* inside: two shelves and a few things on them */}
        <line x1="44" y1="78" x2="156" y2="78" />
        <line x1="44" y1="134" x2="156" y2="134" />
        <rect x="58" y="48" width="20" height="30" rx="5" fill="var(--accent)" fillOpacity="0.35" />
        <rect x="88" y="56" width="26" height="22" rx="5" fill="var(--accent)" fillOpacity="0.2" />
        <rect x="122" y="104" width="22" height="30" rx="6" fill="var(--accent)" fillOpacity="0.35" />
        <path d="M60 134v-18a8 8 0 0 1 16 0v18" fill="var(--accent)" fillOpacity="0.2" />
        <rect x="40" y="20" width="120" height="170" rx="12" />
        <line x1="62" y1="190" x2="62" y2="206" />
        <line x1="138" y1="190" x2="138" y2="206" />
      </g>
      <g className="door-left">
        <rect x="40" y="20" width="60" height="170" rx="12" fill="var(--surface)" stroke="currentColor" strokeWidth={7} vectorEffect="non-scaling-stroke" />
        <line x1="86" y1="96" x2="86" y2="120" stroke="currentColor" strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </g>
      <g className="door-right">
        <rect x="100" y="20" width="60" height="170" rx="12" fill="var(--surface)" stroke="currentColor" strokeWidth={7} vectorEffect="non-scaling-stroke" />
        <line x1="114" y1="96" x2="114" y2="120" stroke="currentColor" strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
