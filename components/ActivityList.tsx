"use client";

import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import type { api } from "@/convex/_generated/api";
import { useLang, useT } from "@/lib/i18n";

type Activity = FunctionReturnType<typeof api.activities.feed>[number];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Activities in plain language ("Anna used Maito · 2 → 1 · 10 min ago"), newest first. */
export function ActivityList({ activities }: { activities: Activity[] | undefined }) {
  const t = useT();
  const now = useNow();
  const ago = useTimeAgo();

  if (activities === undefined) return <p className="text-zinc-500">{t("common.loading")}</p>;
  if (activities.length === 0) return <p className="text-zinc-500">{t("activity.none")}</p>;

  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {activities.map((activity) => (
        <li key={activity._id} className="flex flex-col px-3 py-2">
          <span>
            {t(`activity.${activity.kind}` as const, {
              member: activity.memberName,
              product: activity.productName,
              fromName: activity.fromName ?? "",
            })}
          </span>
          <span className="text-sm text-zinc-500">
            {[
              activity.from !== undefined &&
                activity.to !== undefined &&
                t("activity.stockChange", { from: activity.from, to: activity.to }),
              ago(activity.at, now),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The current time, updated every minute so "10 min ago" stays true. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** "10 min ago" / "10 min sitten" in the Member's language. */
function useTimeAgo() {
  const format = new Intl.RelativeTimeFormat(useLang(), { numeric: "auto", style: "short" });
  return (at: number, now: number) => {
    const elapsed = Math.max(0, now - at);
    if (elapsed < MINUTE) return format.format(0, "second");
    if (elapsed < HOUR) return format.format(-Math.floor(elapsed / MINUTE), "minute");
    if (elapsed < DAY) return format.format(-Math.floor(elapsed / HOUR), "hour");
    return format.format(-Math.floor(elapsed / DAY), "day");
  };
}
