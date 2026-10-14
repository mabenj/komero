"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useT } from "@/lib/i18n";

export default function KotiPage() {
  const t = useT();
  const inventory = useQuery(api.inventory.get);

  if (inventory === undefined) return <p className="text-zinc-500">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-6">
      {inventory.map((location) => (
        <section key={location._id} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{location.name}</h2>
          {location.products.length === 0 && <p className="text-sm text-zinc-500">{t("koti.noProducts")}</p>}
        </section>
      ))}
    </div>
  );
}
