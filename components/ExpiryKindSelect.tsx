"use client";

import { EXPIRY_KINDS, type ExpiryKind } from "@/convex/stock";
import { useT } from "@/lib/i18n";

/** Picks a Product's Expiry Kind: no date, Best Before or Use By. */
export function ExpiryKindSelect({
  value,
  onChange,
  className,
  "aria-label": label,
}: {
  value: ExpiryKind | null;
  onChange: (kind: ExpiryKind | null) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const t = useT();
  return (
    <select
      value={value ?? "none"}
      onChange={(event) => onChange(EXPIRY_KINDS.find((kind) => kind === event.target.value) ?? null)}
      aria-label={label}
      className={className}
    >
      <option value="none">{t("product.expiryKind.none")}</option>
      {EXPIRY_KINDS.map((kind) => (
        <option key={kind} value={kind}>
          {t(`product.expiryKind.${kind}`)}
        </option>
      ))}
    </select>
  );
}
