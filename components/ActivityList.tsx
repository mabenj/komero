"use client";

import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import type { api } from "@/convex/_generated/api";
import { byDay } from "@/lib/activityDays";
import { useLang, useT } from "@/lib/i18n";
import { group, groupHeader, groupRow } from "@/lib/styles";

type Activity = FunctionReturnType<typeof api.activities.recent>[number];

/**
 * Activities in plain language ("Anna used Maito · 2 → 1 · 14.32"), newest
 * first, as a grouped list for each day under its header ("Tänään", "Eilen",
 * "ma 12.10.").
 */
export function ActivityList({ activities }: { activities: Activity[] | undefined }) {
  const t = useT();
  const lang = useLang();
  // Only the day matters; a list left open past midnight says "Tänään" for yesterday until it remounts.
  const [now] = useState(Date.now);

  if (activities === undefined) return <p className="px-4 text-stone-500">{t("common.loading")}</p>;
  if (activities.length === 0) return <p className={`${group} px-4 py-3 text-secondary`}>{t("activity.none")}</p>;

  return (
    <div className="flex flex-col gap-5">
      {byDay(activities, now, lang).map((day) => (
        <section key={day.day}>
          <h3 className={groupHeader}>{day.label}</h3>
          <ul className={group}>
            {day.activities.map((activity) => (
              <li key={activity._id} className={`${groupRow} flex flex-col gap-0.5 px-4 py-2.5`}>
                <span>
                  {t(`activity.${activity.kind}` as const, {
                    member: activity.memberName,
                    product: activity.productName,
                    fromName: activity.fromName ?? "",
                  })}
                </span>
                <span className="text-sm text-secondary tabular-nums">
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
      ))}
    </div>
  );
}
