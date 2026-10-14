"use client";

import { useT } from "@/lib/i18n";

export default function ScanPage() {
  const t = useT();
  return <p className="text-zinc-500">{t("scan.comingSoon")}</p>;
}
