import { en } from "./en";
import { fi, type MessageKey } from "./fi";

export type Lang = "fi" | "en";
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const dictionaries: Record<Lang, Record<MessageKey, string>> = { fi, en };

/** A function that looks up UI strings in `lang` and fills in their {placeholders}. */
export function translator(lang: Lang): Translate {
  return (key, vars) =>
    dictionaries[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`));
}

/** Finnish lookup for places outside any Member's session (metadata, manifest). */
export const translate = translator("fi");
