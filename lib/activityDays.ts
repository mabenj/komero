import { type Lang, translator } from "./i18n/translate";

/**
 * `activities` (newest first) grouped by the phone's calendar day, each group
 * with its header ("Tänään", "Eilen", "ma 12.10.") and each row its clock time.
 */
export function byDay<T extends { at: number }>(activities: T[], now: number, lang: Lang) {
  const t = translator(lang);
  const date = new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "numeric" });
  const time = new Intl.DateTimeFormat(lang, { timeStyle: "short" });
  const today = new Date(now).toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const label = (day: string, at: number) =>
    day === today ? t("activity.today")
    : day === yesterday.toDateString() ? t("activity.yesterday")
    : date.format(at);

  const groups: { day: string; label: string; activities: (T & { time: string })[] }[] = [];
  for (const activity of activities) {
    const day = new Date(activity.at).toDateString();
    if (groups.at(-1)?.day !== day) groups.push({ day, label: label(day, activity.at), activities: [] });
    groups.at(-1)!.activities.push({ ...activity, time: time.format(activity.at) });
  }
  return groups;
}
