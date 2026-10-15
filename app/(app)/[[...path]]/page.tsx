"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { navigate } from "@/components/AppLink";
import type { Id } from "@/convex/_generated/dataModel";
import { lastTab } from "@/lib/remembered";
import KotiScreen from "../_screens/Koti";
import ListaScreen from "../_screens/Lista";
import ProductScreen from "../_screens/Product";
import ScanScreen from "../_screens/Scan";
import SettingsScreen from "../_screens/Settings";

/**
 * The whole signed-in app is this one route, which picks the screen from the
 * URL on the client. Moving between screens (see `AppLink`) never asks the
 * server for a route, so it keeps working while offline.
 */
export default function AppScreens() {
  const pathname = usePathname();
  const [, first, second, ...rest] = pathname.split("/");
  const screen =
    rest.length > 0 ? null
    : first === "koti" && second ? <ProductScreen key={second} productId={second as Id<"products">} />
    : second ? null
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

  return screen;
}
