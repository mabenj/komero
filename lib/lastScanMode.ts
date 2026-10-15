// Scanning starts in the mode the Member used last on this device. A per-device
// convenience, so browser storage is fine (and failures fall back to Add).
export const SCAN_MODES = ["add", "use", "needMore"] as const;
export type ScanMode = (typeof SCAN_MODES)[number];

const STORAGE_KEY = "komero.lastScanMode";

export function rememberScanMode(mode: ScanMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

export function lastScanMode(): ScanMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SCAN_MODES.includes(stored as ScanMode)) return stored as ScanMode;
  } catch {}
  return "add";
}
