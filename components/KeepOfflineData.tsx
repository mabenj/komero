"use client";

import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { localToday } from "@/lib/dates";

// Product pages kept subscribed: the most recently opened ones.
const KEEP_PRODUCTS = 20;

/**
 * The Convex client forgets a query's last result once no screen uses it, so a
 * screen opened while offline would only say "Loading…". The signed-in app
 * keeps every tab's queries subscribed, and the Product pages opened this
 * session, so switching screens offline still shows the last data (ADR-0001).
 * Screens asking for the same query share the subscription.
 */
export function KeepOfflineData() {
  useQuery(api.inventory.get);
  useQuery(api.inventory.needsAttention, { today: localToday() });
  useQuery(api.shoppingList.get);
  useQuery(api.members.list);
  useQuery(api.activities.feed);

  const pathname = usePathname();
  const opened = pathname.match(/^\/koti\/([^/]+)$/)?.[1] as Id<"products"> | undefined;
  const [products, setProducts] = useState<Id<"products">[]>([]);
  if (opened && products.at(-1) !== opened) {
    setProducts([...products.filter((id) => id !== opened), opened].slice(-KEEP_PRODUCTS));
  }
  return products.map((productId) => <KeepProduct key={productId} productId={productId} />);
}

function KeepProduct({ productId }: { productId: Id<"products"> }) {
  useQuery(api.products.get, { productId });
  useQuery(api.activities.forProduct, { productId });
  return null;
}
