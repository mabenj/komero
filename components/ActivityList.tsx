"use client";

import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import type { api } from "@/convex/_generated/api";
import { byDay } from "@/lib/activityDays";
import { useLang, useT } from "@/lib/i18n";
import { cardList } from "@/lib/styles";

type Activity = FunctionReturnType<typeof api.activities.recent>[number];

/**
 * Activities in plain language ("Anna used Maito · 2 → 1 · 14.32"), newest
 * first, under day headers ("Tänään", "Eilen", "ma 12.10.").
 */
export function ActivityList({ activities }: { activities: Activity[] | undefined }) {
  const t = useT();
  const lang = useLang();
  // Only the day matters; a list left open past midnight says "Tänään" for yesterday until it remounts.
  const [now] = useState(Date.now);

  if (activities === undefined) return <p className="text-stone-500">{t("common.loading")}</p>;
  if (activities.length === 0) return <p className="text-stone-500">{t("activity.none")}</p>;

  return byDay(activities, now, lang).map((day) => (
    <section key={day.day} className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-stone-500">{day.label}</h3>
      <ul className={cardList}>
        {day.activities.map((activity) => (
          <li key={activity._id} className="flex flex-col px-3 py-2">
            <span>
              {t(`activity.${activity.kind}` as const, {
                member: activity.memberName,
                product: activity.productName,
                fromName: activity.fromName ?? "",
              })}
            </span>
            <span className="text-sm text-stone-500">
              {[
                activity.from !== undefined &&
                  activity.to !== undefined &&
                  t("activity.stockChange", { from: activity.from, to: activity.to }),
                activity.quantity !== undefined && t("activity.quantity", { quantity: activity.quantity }),
                activity.time,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  ));
}
