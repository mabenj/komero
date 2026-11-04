"use client";

import { Authenticated, AuthLoading } from "convex/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppLink } from "@/components/AppLink";
import { HomeIcon, ListIcon, ScanIcon, SettingsIcon } from "@/components/icons";
import { KeepOfflineData } from "@/components/KeepOfflineData";
import { MotionProvider } from "@/components/motion";
import { OfflineBanner } from "@/components/OfflineBanner";
import { UndoToastProvider } from "@/components/UndoToast";
import { useT } from "@/lib/i18n";
import { rememberTab, TABS, type Tab } from "@/lib/remembered";

type Place = Tab | "settings";

const PLACES = [
  { place: "koti", Icon: HomeIcon },
  { place: "scan", Icon: ScanIcon },
  { place: "lista", Icon: ListIcon },
  { place: "settings", Icon: SettingsIcon },
] as const;

/** The signed-in app: a midnight rail (wide screens) or bottom bar (phones), the screen's title with ⚙ Settings on phones, and the page. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  const t = useT();
  const pathname = usePathname();
  // A Product page belongs to the tab it opened over (/koti/<id>, /lista/<id>), Tapahtumat to Settings.
  const currentTab = TABS.find((tab) => pathname === `/${tab}` || pathname.startsWith(`/${tab}/`));
  const current: Place | undefined =
    currentTab ?? (pathname === "/settings" || pathname.startsWith("/settings/") ? "settings" : undefined);

  useEffect(() => {
    if (currentTab) rememberTab(currentTab);
  }, [currentTab]);

  return (
    <div className="min-h-dvh">
      <Rail current={current} />
      <div className="md:pl-20">
        <header className="material sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 pt-4 pb-3">
            <h1 className="font-display text-[26px] font-extrabold text-accent">{current && t(`nav.${current}`)}</h1>
            {/* Phones only; wide screens have Settings at the foot of the rail. */}
            <AppLink
              href="/settings"
              aria-label={t("nav.settings")}
              aria-current={current === "settings" ? "page" : undefined}
              className={`-m-2 rounded-md p-2 md:hidden ${current === "settings" ? "text-accent" : "text-stone-500"}`}
            >
              <SettingsIcon />
            </AppLink>
          </div>
          <OfflineBanner />
        </header>
        <main className="mx-auto max-w-xl overflow-x-clip px-4 py-2 pb-28 md:pb-10">
          <AuthLoading>
            <p className="text-stone-500">{t("common.loading")}</p>
          </AuthLoading>
          <Authenticated>
            <KeepOfflineData />
            <MotionProvider>
              <UndoToastProvider>{children}</UndoToastProvider>
            </MotionProvider>
          </Authenticated>
        </main>
      </div>
      <BottomBar current={current} />
    </div>
  );
}

/** Wide screens: a narrow midnight rail down the left, with the app's initial on top and Settings at the bottom. */
function Rail({ current }: { current: Place | undefined }) {
  const t = useT();
  return (
    <nav className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col items-center gap-2 bg-rail py-4 text-rail-foreground md:flex">
      <span
        aria-hidden="true"
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-accent font-bold text-accent-foreground"
      >
        {t("app.name").charAt(0)}
      </span>
      {PLACES.map(({ place, Icon }) => {
        const active = current === place;
        return (
          <AppLink
            key={place}
            href={`/${place}`}
            aria-current={active ? "page" : undefined}
            className={`flex w-16 flex-col items-center gap-1 rounded-md py-2 text-[11px] font-semibold ${
              place === "settings" ? "mt-auto" : ""
            } ${active ? "bg-white/10 text-white" : "hover:text-white"}`}
          >
            <Icon width={22} height={22} className={active ? "text-accent" : undefined} />
            {t(`nav.${place}`)}
          </AppLink>
        );
      })}
    </nav>
  );
}

/** Phones: a frosted midnight bar along the bottom with the three tabs, Scan as a flat carrot square in the middle. */
function BottomBar({ current }: { current: Place | undefined }) {
  const t = useT();
  return (
    <nav className="material-rail fixed inset-x-0 bottom-0 z-10 pb-[env(safe-area-inset-bottom)] text-rail-foreground md:hidden">
      <div className="flex items-center py-1.5">
        {PLACES.filter(({ place }) => place !== "settings").map(({ place, Icon }) => {
          const active = current === place;
          if (place === "scan")
            return (
              <AppLink
                key={place}
                href="/scan"
                aria-label={t("nav.scan")}
                aria-current={active ? "page" : undefined}
                className="flex flex-1 justify-center"
              >
                <span className="flex h-12 w-14 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <ScanIcon width={24} height={24} />
                </span>
              </AppLink>
            );
          return (
            <AppLink
              key={place}
              href={`/${place}`}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-1.5 text-[11px] font-semibold ${active ? "text-white" : ""}`}
            >
              <Icon width={22} height={22} className={active ? "text-accent" : undefined} />
              {t(`nav.${place}`)}
            </AppLink>
          );
        })}
      </div>
    </nav>
  );
}
