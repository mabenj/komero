"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient, useQuery } from "convex/react";
import { type ReactNode, useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { I18nProvider } from "@/lib/i18n";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  useEffect(() => reconnectWhenBack(convex), []);
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <MemberLanguage>{children}</MemberLanguage>
    </ConvexAuthNextjsProvider>
  );
}

/** The UI follows the signed-in Member's language, not the phone's; Finnish otherwise. */
function MemberLanguage({ children }: { children: ReactNode }) {
  const me = useQuery(api.members.me);
  return <I18nProvider lang={me?.language ?? "fi"}>{children}</I18nProvider>;
}

// Convex's own server-inactivity threshold: a socket silent this long is presumed dead.
const STALE_AFTER_HIDDEN_MS = 60_000;

type SocketManager = {
  socketState(): string;
  closeAndReconnect(reason: string): void;
  tryReconnectImmediately(): void;
};

/**
 * A phone freezes a backgrounded tab, and on return the Convex socket can be stuck mid-connect, waiting out
 * a long backoff, or open but dead, so the offline pill just hangs. Reconnect straight away instead.
 * Reaches into Convex 1.46 internals; every call is optional, so an upgrade that renames them only loses this.
 */
function reconnectWhenBack(client: ConvexReactClient) {
  let hiddenAt: number | null = null;

  const reconnect = () => {
    if (document.visibilityState !== "visible") {
      hiddenAt ??= Date.now();
      return;
    }
    const longAway = hiddenAt !== null && Date.now() - hiddenAt >= STALE_AFTER_HIDDEN_MS;
    hiddenAt = null;
    const ws = (client as unknown as { cachedSync?: { webSocketManager?: Partial<SocketManager> } }).cachedSync
      ?.webSocketManager;
    const state = ws?.socketState?.();
    if (state === "connecting" || (state === "ready" && longAway)) ws?.closeAndReconnect?.("AppResumed");
    if (state !== "terminated" && state !== "stopped") ws?.tryReconnectImmediately?.();
  };

  document.addEventListener("visibilitychange", reconnect);
  window.addEventListener("pageshow", reconnect);
  window.addEventListener("online", reconnect);
  return () => {
    document.removeEventListener("visibilitychange", reconnect);
    window.removeEventListener("pageshow", reconnect);
    window.removeEventListener("online", reconnect);
  };
}
