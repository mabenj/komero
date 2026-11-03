"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLang, useT, type Lang } from "@/lib/i18n";

const LANGS: Lang[] = ["fi", "en"];

/** ⚙ Language: switches the signed-in Member's language on every device. */
export function LanguagePicker() {
  const t = useT();
  const current = useLang();
  const setLanguage = useMutation(api.members.setLanguage).withOptimisticUpdate((store, { language }) => {
    const me = store.getQuery(api.members.me, {});
    if (me) store.setQuery(api.members.me, {}, { ...me, language });
  });

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">{t("settings.language")}</legend>
      <div className="flex gap-2">
        {LANGS.map((lang) => (
          <button
            key={lang}
            type="button"
            lang={lang}
            aria-pressed={current === lang}
            onClick={() => setLanguage({ language: lang })}
            className={`flex-1 rounded-md py-3 text-lg ${
              current === lang ? "bg-accent font-semibold text-accent-foreground" : "bg-stone-200 dark:bg-stone-700"
            }`}
          >
            {t(`settings.language.${lang}`)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
