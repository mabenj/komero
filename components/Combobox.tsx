"use client";

import { useQuery } from "convex/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import { nameKey, searchProducts } from "@/convex/productNames";
import { splitAtMatch } from "@/lib/highlight";
import { useT } from "@/lib/i18n";
import { field } from "@/lib/styles";

export type ComboboxOption = {
  key: string;
  /** A Product's name, with the typed part in bold, or for `add`, what adding does. */
  label: string;
  detail?: ReactNode;
  /** An option that adds what was typed, in carrot and always last. */
  add?: boolean;
  onPick: () => void;
};

/**
 * A search field whose options float in a panel under it, like a search
 * engine's suggestions: ↑/↓ move a highlight, Enter picks it, or with nothing
 * highlighted the Product named exactly as typed, else the add option. Escape
 * or a tap elsewhere closes the panel and keeps the text. A pick closes the
 * panel; the field keeps focus only with `keepFocus`, so the next name can be
 * typed at once. `inline` puts the options in the page's flow instead, for a
 * field inside a scrolling card that would clip a floating panel.
 */
export function Combobox({
  value,
  onChange,
  label,
  options,
  empty,
  keepFocus = false,
  autoFocus = false,
  inline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: ComboboxOption[];
  /** Shown in the panel when there are no options; with none, the panel stays shut. */
  empty?: string;
  keepFocus?: boolean;
  autoFocus?: boolean;
  inline?: boolean;
}) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const shown = open && value.trim() !== "" && (options.length > 0 || empty !== undefined);
  const optionId = (index: number) => `${listId}-${index}`;

  // A tap on something that can't take focus doesn't blur the field on every phone, so it closes the panel itself.
  useEffect(() => {
    if (!shown) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [shown]);

  const pick = (option: ComboboxOption | undefined) => {
    if (!option) return;
    setOpen(false);
    setActive(-1);
    if (!keepFocus) input.current?.blur();
    option.onPick();
  };
  const typed = nameKey(value);
  const enterPick = () =>
    active >= 0
      ? options[active]
      : (options.find((option) => !option.add && nameKey(option.label) === typed) ??
        options.find((option) => option.add));

  return (
    // Above the screen's content, below the header, nav and toasts.
    <div ref={root} className="relative z-4">
      <SearchIcon
        width={20}
        height={20}
        className="pointer-events-none absolute top-6 left-3.5 -translate-y-1/2 text-stone-400"
      />
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? optionId(active) : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const step = event.key === "ArrowDown" ? 1 : -1;
            // Past either end the highlight leaves the options, back to what was typed.
            setActive((current) => Math.max(-1, Math.min(options.length - 1, current + step)));
          } else if (event.key === "Enter" && shown) {
            // With the panel shut, Enter does what it would anyway, such as sending the form around the field.
            event.preventDefault();
            pick(enterPick());
          } else if (event.key === "Escape") setOpen(false);
        }}
        placeholder={label}
        aria-label={label}
        autoFocus={autoFocus}
        enterKeyHint="go"
        autoComplete="off"
        className={`${field} w-full py-3 pr-11 pl-11`}
      />
      {value !== "" && (
        <button
          type="button"
          aria-label={t("common.clear")}
          // Keeps focus in the field, so the keyboard stays up for a new search.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            setActive(-1);
            input.current?.focus();
          }}
          className="absolute top-0 right-0 flex size-12 items-center justify-center text-stone-400"
        >
          <CloseIcon width={18} height={18} />
        </button>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!shown}
        className={`mt-1.5 rounded-lg border border-stone-200 bg-surface py-1 dark:border-stone-700 ${
          inline ? "" : "absolute inset-x-0 top-full max-h-80 overflow-y-auto shadow-xl shadow-black/10"
        }`}
      >
        {options.length === 0 && <li className="px-4 py-3 text-sm text-stone-500">{empty}</li>}
        {options.map((option, index) => (
          <li
            key={option.key}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            // A tap picks without first taking focus from the field, which would close the panel.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(option)}
            // Only a mouse highlights by hovering; a finger scrolling the panel shouldn't.
            onPointerMove={(event) => event.pointerType === "mouse" && setActive(index)}
            className={`flex min-h-11 cursor-pointer flex-col justify-center px-4 py-1.5 text-sm ${
              index === active ? "bg-stone-100 dark:bg-stone-800" : ""
            } ${option.add ? "font-semibold text-accent" : ""}`}
          >
            <span className="truncate">{option.add ? option.label : <Highlighted name={option.label} text={value} />}</span>
            {option.detail && <span className="truncate text-xs font-normal text-stone-500">{option.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A name with the part matching the typed text in bold. */
function Highlighted({ name, text }: { name: string; text: string }) {
  const [before, match, after] = splitAtMatch(name, text);
  return (
    <>
      {before}
      <b className="font-semibold">{match}</b>
      {after}
    </>
  );
}

/**
 * `products.search` for a combobox. Until the server answers the new text, or
 * while the connection is down, the same search runs on the Products already on
 * the phone (kept by KeepOfflineData), so options show at once on every keystroke.
 */
export function useProductSearch(text: string) {
  const result = useQuery(api.products.search, text.trim() ? { text } : "skip");
  const inventory = useQuery(api.inventory.get);
  if (!text.trim()) return undefined;
  if (result || !inventory) return result;
  const products = inventory.flatMap((location) =>
    location.products.map(({ _id, name, stock, expiryKind }) => ({ _id, name, stock, expiryKind, locationName: location.name })),
  );
  return searchProducts(products, text);
}
