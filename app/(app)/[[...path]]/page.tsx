"use client";

import { AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { navigate } from "@/components/AppLink";
import { CoveredScreen, TopScreen } from "@/components/TopScreen";
import type { Id } from "@/convex/_generated/dataModel";
import { lastTab } from "@/lib/remembered";
import { scrollFor } from "@/lib/screenHistory";
import KotiScreen from "../_screens/Koti";
import ListaScreen from "../_screens/Lista";
import ActivitiesScreen from "../_screens/Activities";
import ProductScreen from "../_screens/Product";
import ScanScreen from "../_screens/Scan";
import SettingsScreen from "../_screens/Settings";

/**
 * The whole signed-in app is this one route, which picks the screen from the
 * URL on the client. Moving between screens (see `AppLink`) never asks the
 * server for a route, so it keeps working while offline. A Product page
 * (/koti/<id> or /lista/<id>) is opened from Komero or Kauppalista and fades
 * in over it; that screen stays mounted underneath, so Back returns to it as
 * it was left, search results and all.
 * The Tapahtumat screen (/settings/tapahtumat) opens over Settings the same way.
 */
export default function AppScreens() {
  const pathname = usePathname();
  useScrollRestore(pathname);
  const [, first, second, ...rest] = pathname.split("/");
  const productId =
    (first === "koti" || first === "lista") && second && rest.length === 0 ? (second as Id<"products">) : null;
  const isActivities = pathname === "/settings/tapahtumat";
  const screen =
    productId !== null ? (first === "lista" ? <ListaScreen /> : <KotiScreen />)
    : isActivities ? <SettingsScreen />
    : rest.length > 0 || second ? null
    : first === "koti" ? <KotiScreen />
    : first === "scan" ? <ScanScreen />
    : first === "lista" ? <ListaScreen />
    : first === "settings" ? <SettingsScreen />
    : null;

  const known = screen !== null;
  // The start URL ("/") reopens the last used tab; an unknown path goes to Koti.
  useEffect(() => {
    if (!known) navigate(pathname === "/" ? `/${lastTab()}` : "/koti", { replace: true });
  }, [known, pathname]);

  const topScreen =
    productId !== null ? <ProductScreen productId={productId} home={`/${first}`} />
    : isActivities ? <ActivitiesScreen />
    : null;

  return (
    <>
      <CoveredScreen covered={topScreen !== null}>{screen}</CoveredScreen>
      <AnimatePresence initial={false}>{topScreen && <TopScreen key={pathname}>{topScreen}</TopScreen>}</AnimatePresence>
    </>
  );
}

/**
 * Each screen opens at the scroll position its history entry remembers: where
 * the Member left it, when Back or Forward returns to it, otherwise the top.
 * This waits for the screen to render; the browser's own restoring would
 * happen while the previous screen is still showing.
 */
function useScrollRestore(pathname: string) {
  useEffect(() => {
    window.history.scrollRestoration = "manual";
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, scrollFor(window.history.state));
  }, [pathname]);
}
