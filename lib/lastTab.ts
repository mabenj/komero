// The app reopens on the tab the Member used last. This is a per-device
// convenience, so browser storage is fine (and failures fall back to Koti).
export const TABS = ["koti", "scan", "lista"] as const;
export type Tab = (typeof TABS)[number];

const STORAGE_KEY = "komero.lastTab";

export function rememberTab(tab: Tab) {
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {}
}

export function lastTab(): Tab {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (TABS.includes(stored as Tab)) return stored as Tab;
  } catch {}
  return "koti";
}
