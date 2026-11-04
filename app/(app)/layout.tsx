"use client";

import { Authenticated, AuthLoading } from "convex/react";
import { useEffect } from "react";
import { AppLink } from "@/components/AppLink";
import { HomeIcon, ListIcon, ScanIcon, SettingsIcon } from "@/components/icons";
import { KeepOfflineData } from "@/components/KeepOfflineData";
import { MotionProvider } from "@/components/motion";
import { OfflineBanner } from "@/components/OfflineBanner";
import { type Place, usePlace } from "@/components/ScreenHeader";
import { UndoToastProvider } from "@/components/UndoToast";
import { useT } from "@/lib/i18n";
import { rememberTab } from "@/lib/remembered";

const PLACES = [
  { place: "koti", Icon: HomeIcon },
  { place: "scan", Icon: ScanIcon },
  { place: "lista", Icon: ListIcon },
  { place: "settings", Icon: SettingsIcon },
] as const;

/**
 * The signed-in app: a graphite rail down the left on wide screens, a
 * floating pill along the bottom on phones, and the page. Each tab's screen
 * brings its own header (`ScreenHeader`).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  const t = useT();
  const current = usePlace();

  useEffect(() => {
    if (current && current !== "settings") rememberTab(current);
  }, [current]);

  return (
    <div className="min-h-dvh">
      <Rail current={current} />
      <OfflineBanner />
      <div className="md:pl-20">
        {/* Room at the foot for the floating + to scroll clear of the last row. */}
        <main className="mx-auto max-w-xl overflow-x-clip px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-[calc(var(--nav-clearance)+var(--tray-clearance)+5.5rem)]">
          <AuthLoading>
            <p className="pt-12 text-stone-500">{t("common.loading")}</p>
          </AuthLoading>
          <Authenticated>
            <KeepOfflineData />
            <MotionProvider>
              <UndoToastProvider>{children}</UndoToastProvider>
            </MotionProvider>
          </Authenticated>
        </main>
      </div>
      <PillNav current={current} />
    </div>
  );
}

/** Wide screens: a narrow graphite rail down the left, with the app's initial on top and Settings at the bottom. */
function Rail({ current }: { current: Place | undefined }) {
  const t = useT();
  return (
    <nav className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col items-center gap-2 bg-rail py-4 text-rail-foreground md:flex">
      <span
        aria-hidden="true"
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent font-bold text-accent-foreground"
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
            className={`flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold ${
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

/**
 * Phones: a graphite pill floating over the foot of the page, with Komero and
 * Kauppalista either side of a round carrot Scan. The current tab widens to
 * show its name.
 */
function PillNav({ current }: { current: Place | undefined }) {
  const t = useT();
  const tab = (place: "koti" | "lista", Icon: typeof HomeIcon) => {
    const active = current === place;
    return (
      <AppLink
        href={`/${place}`}
        aria-current={active ? "page" : undefined}
        aria-label={t(`nav.${place}`)}
        className={`flex h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold ${
          active ? "flex-[1.6] bg-white/12 text-white" : "flex-1 text-white/55"
        }`}
      >
        <Icon width={22} height={22} className={active ? "text-accent" : undefined} />
        {active && <span aria-hidden="true">{t(`nav.${place}`)}</span>}
      </AppLink>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 mx-auto flex w-[min(22rem,calc(100%-2rem))] items-center gap-1 rounded-full bg-rail p-1.5 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.45)] md:hidden">
      {tab("koti", HomeIcon)}
      <AppLink
        href="/scan"
        aria-label={t("nav.scan")}
        aria-current={current === "scan" ? "page" : undefined}
        className="-my-4 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground ring-4 ring-background"
      >
        <ScanIcon width={26} height={26} />
      </AppLink>
      {tab("lista", ListIcon)}
    </nav>
  );
}
