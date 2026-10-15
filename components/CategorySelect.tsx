"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";

/** Picks a Product's Category in walking order, or no Category. */
export function CategorySelect({
  value,
  onChange,
  className,
  "aria-label": label,
}: {
  value: Id<"categories"> | null;
  onChange: (categoryId: Id<"categories"> | null) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const t = useT();
  const categories = useQuery(api.categories.list);
  return (
    <select
      value={value ?? ""}
      onChange={(event) => onChange(categories?.find((c) => c._id === event.target.value)?._id ?? null)}
      aria-label={label}
      className={className}
    >
      <option value="">{t("product.noCategory")}</option>
      {categories?.map((category) => (
        <option key={category._id} value={category._id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}
