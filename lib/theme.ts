import { chosenTheme, rememberTheme, type Theme } from "./remembered";

/**
 * Sets `data-theme` on <html>, which dark mode follows (app/globals.css), from
 * the Theme chosen on this device. Keep in step with `themeScript`, which does
 * the same before the first paint.
 */
export function applyTheme(theme: Theme = chosenTheme()) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function chooseTheme(theme: Theme) {
  rememberTheme(theme);
  applyTheme(theme);
}

/**
 * Inlined in <head> so the page never flashes the wrong theme: applies the
 * chosen Theme, and re-applies it when the device switches between light and
 * dark while the app is open.
 */
export const themeScript = `(function () {
  function apply() {
    var theme = null;
    try { theme = localStorage.getItem("komero.theme"); } catch (e) {}
    var dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
  apply();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
})();`;
