"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { chosenTheme, THEMES } from "@/lib/remembered";
import { chooseTheme } from "@/lib/theme";

/** ⚙ Theme: System, Light or Dark, on this device only. */
export function ThemePicker() {
  const t = useT();
  // Read from this device as Settings opens, like Koti's folded Locations.
  const [current, setCurrent] = useState(chosenTheme);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">{t("settings.theme")}</legend>
      <div className="flex gap-2">
        {THEMES.map((theme) => (
          <button
            key={theme}
            type="button"
            aria-pressed={current === theme}
            onClick={() => {
              chooseTheme(theme);
              setCurrent(theme);
            }}
            className={`flex-1 rounded-md py-3 ${
              current === theme ? "bg-accent font-semibold text-accent-foreground" : "bg-stone-200 dark:bg-stone-700"
            }`}
          >
            {t(`settings.theme.${theme}`)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
