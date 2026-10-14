// New Products default to the Location the Member used last on this device.
// A per-device convenience, so browser storage is fine.
const STORAGE_KEY = "komero.lastLocation";

export function rememberLocation(locationId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, locationId);
  } catch {}
}

export function lastLocation(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
