// Expiry Dates are calendar days ("YYYY-MM-DD") in the household's own time zone,
// so "today" comes from the phone, not the server.
import { type Lang, translator } from "./i18n/translate";

/** The phone's date today, as "YYYY-MM-DD". */
export function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * How far an Expiry Date is from today, in a few characters: "tänään",
 * "huomenna", "5 pv", "2 vk", "3 kk", "yli 1 v", or "… sitten" when it has passed.
 * Each step rounds down.
 */
export function relativeExpiry(expiryDate: string, today: string, lang: Lang): string {
  const t = translator(lang);
  const past = expiryDate < today;
  const [early, late] = past ? [expiryDate, today] : [today, expiryDate];
  const [y1, m1, d1] = early.split("-").map(Number);
  const [y2, m2, d2] = late.split("-").map(Number);
  const days = (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (24 * 60 * 60 * 1000);
  if (days === 0) return t("expiry.today");
  if (days === 1) return t(past ? "expiry.yesterday" : "expiry.tomorrow");
  const months = (y2 - y1) * 12 + m2 - m1 - (d2 < d1 ? 1 : 0);
  const time =
    days <= 13 ? t("expiry.days", { count: days })
    : days <= 8 * 7 ? t("expiry.weeks", { count: Math.floor(days / 7) })
    : late <= `${y1 + 1}${early.slice(4)}` ? t("expiry.months", { count: Math.max(2, months) })
    : t("expiry.overYear");
  return past ? t("expiry.ago", { time }) : time;
}
