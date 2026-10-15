"use client";

import { Authenticated, AuthLoading } from "convex/react";
import { AppLink } from "@/components/AppLink";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { HomeIcon, ListIcon, ScanIcon, SettingsIcon } from "@/components/icons";
import { KeepOfflineData } from "@/components/KeepOfflineData";
import { OfflineBanner } from "@/components/OfflineBanner";
import { UndoToastProvider } from "@/components/UndoToast";
import { useT } from "@/lib/i18n";
import { rememberTab, TABS, type Tab } from "@/lib/remembered";

/** The signed-in app: header with ⚙ Settings, the page, and the bottom bar. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  const t = useT();
  const pathname = usePathname();
  // A Product page (/koti/<id>) belongs to the Koti tab.
  const currentTab = TABS.find((tab) => pathname === `/${tab}` || pathname.startsWith(`/${tab}/`));

  useEffect(() => {
    if (currentTab) rememberTab(currentTab);
  }, [currentTab]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-background pt-[env(safe-area-inset-top)] dark:border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">
            {currentTab ? t(`nav.${currentTab}`) : pathname === "/settings" && t("nav.settings")}
          </h1>
          <AppLink
            href="/settings"
            aria-label={t("nav.settings")}
            className="-m-2 rounded-full p-2 text-zinc-600 dark:text-zinc-300"
          >
            <SettingsIcon />
          </AppLink>
        </div>
        <OfflineBanner />
      </header>
      <main className="flex-1 px-4 py-4 pb-28">
        <AuthLoading>
          <p className="text-zinc-500">{t("common.loading")}</p>
        </AuthLoading>
        <Authenticated>
          <KeepOfflineData />
          <UndoToastProvider>{children}</UndoToastProvider>
        </Authenticated>
      </main>
      <BottomBar current={currentTab} />
    </div>
  );
}

function BottomBar({ current }: { current: Tab | undefined }) {
  const t = useT();
  const tabClass = (tab: Tab) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
      current === tab ? "font-semibold text-foreground" : "text-zinc-500"
    }`;

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-background pb-[env(safe-area-inset-bottom)] dark:border-zinc-800">
      <div className="mx-auto flex max-w-xl items-end">
        <AppLink href="/koti" className={tabClass("koti")} aria-current={current === "koti" ? "page" : undefined}>
          <HomeIcon />
          {t("nav.koti")}
        </AppLink>
        <AppLink
          href="/scan"
          className="flex flex-1 flex-col items-center gap-0.5 pb-2 text-xs"
          aria-current={current === "scan" ? "page" : undefined}
        >
          <span
            className={`-mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-foreground text-background shadow-lg ${
              current === "scan" ? "ring-4 ring-zinc-300 dark:ring-zinc-600" : ""
            }`}
          >
            <ScanIcon width={30} height={30} />
          </span>
          <span className={current === "scan" ? "font-semibold" : "text-zinc-500"}>{t("nav.scan")}</span>
        </AppLink>
        <AppLink href="/lista" className={tabClass("lista")} aria-current={current === "lista" ? "page" : undefined}>
          <ListIcon />
          {t("nav.lista")}
        </AppLink>
      </div>
    </nav>
  );
}
