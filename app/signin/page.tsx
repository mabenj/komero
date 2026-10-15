"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Cupboard } from "@/components/Cupboard";
import { api } from "@/convex/_generated/api";
import { authErrorKey } from "@/lib/authErrors";
import { useT, type MessageKey } from "@/lib/i18n";
import { field, primaryButton } from "@/lib/styles";

export default function SignInPage() {
  const t = useT();
  const router = useRouter();
  const { signIn } = useAuthActions();
  const isFirstRun = useQuery(api.members.isFirstRun);
  const [error, setError] = useState<MessageKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isFirstRun === undefined) {
    return <p className="p-6 text-center text-stone-500">{t("common.loading")}</p>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("flow", isFirstRun ? "signUp" : "signIn");
    setSubmitting(true);
    setError(null);
    try {
      await signIn("password", form);
      router.replace("/");
    } catch (e) {
      setError(authErrorKey(e));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2">
        <Cupboard className="h-32 w-32" />
        <h1 className="font-display text-4xl">{t("app.name")}</h1>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">
          {isFirstRun ? t("auth.firstRunTitle") : t("auth.signInTitle")}
        </h2>
        {isFirstRun && <p className="text-stone-600 dark:text-stone-400">{t("auth.firstRunHint")}</p>}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("auth.email")}</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className={`${field} px-3 py-3`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("auth.password")}</span>
          <input
            name="password"
            type="password"
            autoComplete={isFirstRun ? "new-password" : "current-password"}
            minLength={8}
            required
            className={`${field} px-3 py-3`}
          />
          {isFirstRun && <span className="text-sm text-stone-500">{t("auth.passwordHint")}</span>}
        </label>
        {error && (
          <p role="alert" className="text-amber-700 dark:text-amber-400">
            {t(error)}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className={`${primaryButton} py-3 text-lg`}
        >
          {isFirstRun ? t("auth.createAccount") : t("auth.signIn")}
        </button>
      </form>
    </main>
  );
}
