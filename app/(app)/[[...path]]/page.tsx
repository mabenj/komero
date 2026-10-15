"use client";

import { AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { navigate } from "@/components/AppLink";
import { SlideOver } from "@/components/SlideOver";
import type { Id } from "@/convex/_generated/dataModel";
import { lastTab } from "@/lib/remembered";
import { scrollFor } from "@/lib/screenHistory";
import KotiScreen from "../_screens/Koti";
import ListaScreen from "../_screens/Lista";
import ProductScreen from "../_screens/Product";
import ScanScreen from "../_screens/Scan";
import SettingsScreen from "../_screens/Settings";

/**
 * The whole signed-in app is this one route, which picks the screen from the
 * URL on the client. Moving between screens (see `AppLink`) never asks the
 * server for a route, so it keeps working while offline. A Product page
 * slides in over the screen it was opened from.
 */
export default function AppScreens() {
  const pathname = usePathname();
  useScrollRestore(pathname);
  const [, first, second, ...rest] = pathname.split("/");
  const productId = first === "koti" && second && rest.length === 0 ? (second as Id<"products">) : null;
  const screen =
    rest.length > 0 || second ? null
    : first === "koti" ? <KotiScreen />
    : first === "scan" ? <ScanScreen />
    : first === "lista" ? <ListaScreen />
    : first === "settings" ? <SettingsScreen />
    : null;

  const known = screen !== null || productId !== null;
  // The start URL ("/") reopens the last used tab; an unknown path goes to Koti.
  useEffect(() => {
    if (!known) navigate(pathname === "/" ? `/${lastTab()}` : "/koti", { replace: true });
  }, [known, pathname]);

  return (
    <>
      {screen}
      <AnimatePresence initial={false}>
        {productId && (
          <SlideOver key={productId}>
            <ProductScreen productId={productId} />
          </SlideOver>
        )}
      </AnimatePresence>
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
