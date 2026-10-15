"use client";

import type { ComponentProps, MouseEvent } from "react";

/**
 * Moves within the signed-in app (tabs, Product pages, Settings) on the client
 * alone. `history.pushState` updates `usePathname` without asking the server
 * for the route, so switching screens keeps working with no connection, and
 * the Convex client, with the mutations it holds while offline, stays alive
 * (ADR-0001). Next's `<Link>` and `router.push` would fetch the route and fall
 * back to a full page load when that fails.
 */
export function navigate(href: string, { replace = false } = {}) {
  if (replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
  window.scrollTo(0, 0);
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
