"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { translator, type Lang, type Translate } from "./translate";

const LangContext = createContext<Lang>("fi");

/** Puts the UI in `lang` for everything below it, including `<html lang>`. */
export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <LangContext value={lang}>{children}</LangContext>;
}

export const useLang = () => useContext(LangContext);

/** The translator for UI components: `const t = useT(); t("nav.koti")`. */
export function useT(): Translate {
  const lang = useLang();
  return useMemo(() => translator(lang), [lang]);
}
