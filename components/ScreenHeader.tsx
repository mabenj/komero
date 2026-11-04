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
 * The top of a tab's screen: a greeting over the tab's name in large type, and
 * ⚙ Settings on phones (wide screens have it at the foot of the rail). It
 * scrolls away with the page, and a Product page opened over the tab covers it.
 */
export function ScreenHeader() {
  const t = useT();
  const current = usePlace();
  const greeting = useGreeting();
  return (
    <header className="flex items-end justify-between px-1 pt-10 pb-4">
      <div>
        <p className="min-h-5 text-sm font-medium text-stone-500">{greeting && t(greeting)}</p>
        <h1 className="font-display text-[34px] leading-tight font-extrabold">{current && t(`nav.${current}`)}</h1>
      </div>
      <AppLink
        href="/settings"
        aria-label={t("nav.settings")}
        aria-current={current === "settings" ? "page" : undefined}
        className={`flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-raised md:hidden ${
          current === "settings" ? "text-accent" : "text-stone-500"
        }`}
      >
        <SettingsIcon width={20} height={20} />
      </AppLink>
    </header>
  );
}
