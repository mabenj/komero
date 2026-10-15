"use client";

import { usePaginatedQuery } from "convex/react";
import { BackLink } from "@/components/AppLink";
import { ActivityList } from "@/components/ActivityList";
import { api } from "@/convex/_generated/api";
import { useT } from "@/lib/i18n";
import { secondaryButton } from "@/lib/styles";

const PAGE_LENGTH = 50;

/** Every Activity the household still keeps, newest first, a page at a time. Opened from ⚙. */
export default function ActivitiesScreen() {
  const t = useT();
  // Not kept subscribed in KeepOfflineData, unlike the other screens' data
  // (ADR-0001): keeping paginated pages alive in the background is extra code
  // just for browsing old Activities. Opened offline, it says "Loading…" until the
  // connection is back, then fills in.
  const { results, status, loadMore } = usePaginatedQuery(api.activities.feed, {}, { initialNumItems: PAGE_LENGTH });

  return (
    <div className="flex flex-col gap-4">
      <BackLink home="/settings" />
      <h2 className="text-lg font-semibold">{t("activity.feed")}</h2>
      <ActivityList activities={status === "LoadingFirstPage" ? undefined : results} />
      {status !== "Exhausted" && status !== "LoadingFirstPage" && (
        <button
          type="button"
          onClick={() => loadMore(PAGE_LENGTH)}
          disabled={status === "LoadingMore"}
          className={`${secondaryButton} py-3`}
        >
          {t("activity.showOlder")}
        </button>
      )}
    </div>
  );
}
