"use client";

import { useConvexConnectionState } from "convex/react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

// A reconnect blip shorter than this doesn't flash the banner.
const SHOW_AFTER_MS = 1500;

/**
 * A pill floating at the top while the Convex connection is down. Queries keep their last result and the
 * Convex client holds mutations in memory until it reconnects (ADR-0001), so the
 * banner only has to say so.
 */
export function OfflineBanner() {
  const t = useT();
  const { isWebSocketConnected, hasEverConnected, inflightMutations } = useConvexConnectionState();
  const offline = hasEverConnected && !isWebSocketConnected;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!offline) return;
    const timer = setTimeout(() => setShow(true), SHOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setShow(false);
    };
  }, [offline]);

  if (!show) return null;
  return (
    <div
      role="status"
      className="fixed right-4 top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 mx-auto w-fit max-w-md rounded-full bg-amber-100 px-4 py-1.5 text-center text-sm font-medium text-amber-900 shadow-raised left-[calc(var(--rail-width)+1rem)] dark:bg-amber-950 dark:text-amber-200"
    >
      {t("offline.banner")}
      {inflightMutations > 0 && ` · ${t("offline.pending")}`}
    </div>
  );
}
