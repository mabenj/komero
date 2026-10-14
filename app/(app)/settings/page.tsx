"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useT } from "@/lib/i18n";

export default function SettingsPage() {
  const t = useT();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const me = useQuery(api.members.me);

  async function logOut() {
    await signOut();
    router.replace("/signin");
  }

  return (
    <div className="flex flex-col gap-6">
      {me && <p className="text-zinc-600 dark:text-zinc-400">{t("settings.signedInAs", { email: me.email })}</p>}
      <button
        type="button"
        onClick={logOut}
        className="rounded-lg border border-zinc-300 py-3 text-lg font-semibold text-red-600 dark:border-zinc-700"
      >
        {t("settings.logOut")}
      </button>
    </div>
  );
}
