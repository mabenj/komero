"use client";

import type { ComponentProps, MouseEvent } from "react";
import { useT } from "@/lib/i18n";
import { textLink } from "@/lib/styles";
import { arrive, backFrom, leave } from "@/lib/screenHistory";

/**
 * Moves within the signed-in app (tabs, Product pages, Settings) on the client
 * alone. `history.pushState` updates `usePathname` without asking the server
 * for the route, so switching screens keeps working with no connection, and
 * the Convex client, with the mutations it holds while offline, stays alive
 * (ADR-0001). Next's `<Link>` and `router.push` would fetch the route and fall
 * back to a full page load when that fails.
 */
export function navigate(href: string, { replace = false } = {}) {
  const { history, location } = window;
  const samePath = new URL(href, location.href).pathname === location.pathname;
  if (replace) history.replaceState(arrive(history.state, { replace }), "", href);
  else {
    // Remembered for when Back returns to this screen (see `useScrollRestore` in the app's screens).
    history.replaceState(leave(history.state, window.scrollY), "");
    history.pushState(arrive(history.state, { replace }), "", href);
  }
  // A new path scrolls once its screen has rendered (`useScrollRestore`), after
  // a Product page's `CoveredScreen` has kept its place. The same path, such as
  // the current tab tapped again, scrolls to the top now.
  if (samePath) window.scrollTo(0, 0);
}

/** Back to the previous screen of the app, or to `home` (Koti) when the page was opened directly. */
export function goBack(home = "/koti") {
  if (backFrom(window.history.state) === "history") window.history.back();
  else navigate(home, { replace: true });
}

/** "Back", to where the Member came from (see `goBack`). */
export function BackLink({ home }: { home?: string }) {
  const t = useT();
  return (
    <button type="button" onClick={() => goBack(home)} className={`${textLink} -my-2 self-start py-2`}>
      {t("nav.back")}
    </button>
  );
}

/** A link within the signed-in app; see `navigate`. */
export function AppLink({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    // Let the browser handle opening in a new tab or window.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={follow} {...props} />;
}
