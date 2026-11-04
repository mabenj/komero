"use client";

import { useConvexConnectionState } from "convex/react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

// A reconnect blip shorter than this doesn't flash the banner.
const SHOW_AFTER_MS = 1500;

/**
 * A pill floating at the top while the Convex connection is down. Queries keep their last result and the
 * Convex client holds mutations in memory until it reconnects (ADR-0001), so the
 * banner only has to say so, with a spinner while the client keeps retrying.
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
      className="fixed right-4 top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 mx-auto flex w-fit max-w-md items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-center text-sm font-medium text-amber-900 shadow-raised left-[calc(var(--rail-width)+1rem)] dark:bg-amber-950 dark:text-amber-200"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-4 shrink-0 animate-spin motion-reduce:animate-[spin_2.5s_linear_infinite]"
      >
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth={3} opacity={0.25} />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
      </svg>
      <span>
        {t("offline.banner")}
        {inflightMutations > 0 && ` · ${t("offline.pending")}`}
      </span>
    </div>
  );
}
