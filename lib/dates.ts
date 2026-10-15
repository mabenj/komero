// Expiry Dates are calendar days ("YYYY-MM-DD") in the household's own time zone,
// so "today" comes from the phone, not the server.

/** The phone's date today, as "YYYY-MM-DD". */
export function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A short day and month for a "YYYY-MM-DD" date in the UI language, e.g. "20.10." in Finnish. */
export function formatDay(date: string, lang: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(lang, { day: "numeric", month: "numeric" });
}
