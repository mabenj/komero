// Per-device conveniences: the app reopens on the last used tab but Scan, scanning starts
// in the last used mode, and new Products default to the last used Location.
// Browser storage is fine for these, and any failure just falls back to the default.
import { SCAN_MODES, type ScanMode } from "../convex/scanModes";

/** A value remembered on this device under `key`; `valid` rejects stale or foreign values. */
function remembered<T extends string>(key: string, valid: (stored: string) => stored is T) {
  return {
    get(): T | null {
      try {
        const stored = localStorage.getItem(key);
        return stored !== null && valid(stored) ? stored : null;
      } catch {
        return null;
      }
    },
    set(value: T) {
      try {
        localStorage.setItem(key, value);
      } catch {}
    },
  };
}

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (stored: string): stored is T =>
    (values as readonly string[]).includes(stored);

export const TABS = ["koti", "scan", "lista"] as const;
export type Tab = (typeof TABS)[number];

// Never Scan, so that opening the app doesn't start the camera.
const tab = remembered("komero.lastTab", oneOf(["koti", "lista"] as const));
export const rememberTab = (current: Tab) => {
  if (current !== "scan") tab.set(current);
};
export const lastTab = () => tab.get() ?? "koti";

const scanMode = remembered("komero.lastScanMode", oneOf(SCAN_MODES));
export const rememberScanMode = scanMode.set;
export const lastScanMode = (): ScanMode => scanMode.get() ?? "add";

// A Location id; callers check it still exists.
const location = remembered("komero.lastLocation", (stored): stored is string => stored !== "");
export const rememberLocation = location.set;
export const lastLocation = location.get;

// Whether Kauppalista's Bag is folded shut; it starts open.
const bag = remembered("komero.bagFolded", oneOf(["folded", "open"] as const));
export const rememberBagFolded = (folded: boolean) => bag.set(folded ? "folded" : "open");
export const bagFolded = () => bag.get() === "folded";

// ⚙ Theme on this device; System follows the device's light or dark setting.
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
const theme = remembered("komero.theme", oneOf(THEMES));
export const rememberTheme = theme.set;
export const chosenTheme = (): Theme => theme.get() ?? "system";
