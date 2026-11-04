"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { AppLink } from "@/components/AppLink";
import { SettingsIcon } from "@/components/icons";
import { type MessageKey, useT } from "@/lib/i18n";
import { TABS, type Tab } from "@/lib/remembered";

export type Place = Tab | "settings";

/** Where in the app the page is: a Product page belongs to the tab it opened over (/koti/<id>, /lista/<id>), Tapahtumat to Settings. */
export function usePlace(): Place | undefined {
  const pathname = usePathname();
  const tab = TABS.find((tab) => pathname === `/${tab}` || pathname.startsWith(`/${tab}/`));
  return tab ?? (pathname === "/settings" || pathname.startsWith("/settings/") ? "settings" : undefined);
}

const noSubscription = () => () => {};

/** The greeting for the phone's time of day; none while rendering on the server, whose clock may be elsewhere. */
function useGreeting(): MessageKey | null {
  return useSyncExternalStore(
    noSubscription,
    () => {
      const hour = new Date().getHours();
      return hour < 5 ? "greeting.night"
        : hour < 10 ? "greeting.morning"
        : hour < 17 ? "greeting.day"
        : hour < 22 ? "greeting.evening"
        : "greeting.night";
    },
    () => null,
  );
}

/**
 * The top of a tab's screen. Komero and Kauppalista have a greeting over the
 * tab's name in large type; Scan and Settings a plain carrot title. ⚙ Settings
 * is there on phones (wide screens have it at the foot of the rail). It scrolls
 * away with the page, and a Product page opened over the tab covers it.
 */
export function ScreenHeader() {
  const t = useT();
  const current = usePlace();
  const greeting = useGreeting();
  // Scan and Settings keep the plain title they had; only Settings' own page has no ⚙.
  if (current === "scan" || current === "settings")
    return (
      <header className="flex items-center justify-between px-1 pt-4 pb-3">
        <h1 className="font-display text-[26px] font-extrabold text-accent">{t(`nav.${current}`)}</h1>
        {current === "scan" && (
          <AppLink href="/settings" aria-label={t("nav.settings")} className="-m-2 rounded-md p-2 text-stone-500 md:hidden">
            <SettingsIcon />
          </AppLink>
        )}
      </header>
    );
  return (
    <header className="flex items-end justify-between px-1 pt-10 pb-4">
      <div>
        <p className="min-h-5 text-sm font-medium text-stone-500">{greeting && t(greeting)}</p>
        <h1 className="font-display text-[34px] leading-tight font-extrabold">{current && t(`nav.${current}`)}</h1>
      </div>
      <AppLink
        href="/settings"
        aria-label={t("nav.settings")}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-stone-500 shadow-raised md:hidden"
      >
        <SettingsIcon width={20} height={20} />
      </AppLink>
    </header>
  );
}
