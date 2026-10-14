import { fi, type MessageKey } from "./fi";

export type { MessageKey };
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Looks up a UI string and fills in its {placeholders}. */
export const translate: Translate = (key, vars) =>
  fi[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`));

/**
 * The translator for UI components: `const t = useT(); t("nav.koti")`.
 * Finnish only for now; the per-Member language (#16) plugs in here.
 */
export function useT(): Translate {
  return translate;
}
