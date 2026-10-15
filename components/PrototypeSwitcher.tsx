"use client";
/* eslint-disable react/jsx-no-literals -- PROTOTYPE: draft copy, not yet in the dictionaries */

// PROTOTYPE (branch prototype/ui-personality): flips between variants via ?variant=.
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export type PrototypeVariant = { key: string; name: string };

export function usePrototypeParam(name: string, fallback: string) {
  return useSearchParams().get(name) ?? fallback;
}

function setParam(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  window.history.replaceState(null, "", url);
}

export function PrototypeSwitcher({
  variants,
  extras,
}: {
  variants: PrototypeVariant[];
  /** Extra buttons on the bar, e.g. "show a toast". */
  extras?: { label: string; run: () => void; active?: boolean }[];
}) {
  const current = usePrototypeParam("variant", variants[0].key);
  const index = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (by: number) => setParam("variant", variants[(index + by + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  const pill = "rounded-full px-3 py-1.5 font-mono text-xs font-bold";
  return (
    <div
      className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-dashed border-white bg-fuchsia-700 p-1 text-white shadow-2xl"
      style={{ top: "calc(env(safe-area-inset-top) + 4.25rem)" }}
    >
      <button type="button" className={pill} onClick={() => go(-1)} aria-label="Previous variant">
        ←
      </button>
      <span className="px-1 font-mono text-xs font-bold whitespace-nowrap">
        {variants[index].key} · {variants[index].name}
      </span>
      <button type="button" className={pill} onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
      {extras?.map((extra) => (
        <button
          key={extra.label}
          type="button"
          onClick={extra.run}
          className={`${pill} ${extra.active ? "bg-white text-fuchsia-700" : "bg-fuchsia-900"}`}
        >
          {extra.label}
        </button>
      ))}
    </div>
  );
}

export { setParam as setPrototypeParam };
