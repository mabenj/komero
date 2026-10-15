"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Cupboard } from "@/components/Cupboard";
import { api } from "@/convex/_generated/api";
import { authErrorKey } from "@/lib/authErrors";
import { useT, type MessageKey } from "@/lib/i18n";
import { field, primaryButton, textLink } from "@/lib/styles";

/** Opened from an Invite link: the invited person picks an email and password. */
export default function InvitePage() {
  const t = useT();
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const { signIn } = useAuthActions();
  const isUsable = useQuery(api.invites.isUsable, { token });
  const [error, setError] = useState<MessageKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("flow", "signUp");
    form.set("inviteToken", token);
    setSubmitting(true);
    setError(null);
    try {
      await signIn("password", form);
      router.replace("/");
    } catch (e) {
      const key = authErrorKey(e);
      setError(key === "auth.inviteRequired" ? "auth.inviteUnusable" : key);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2">
        <Cupboard className="h-32 w-32" />
        <h1 className="font-display text-4xl">{t("app.name")}</h1>
      </div>
      {isUsable === undefined && <p className="text-stone-500">{t("common.loading")}</p>}
      {isUsable === false && !submitting && (
        <div className="flex flex-col gap-4">
          <p role="alert">{t("auth.inviteUnusable")}</p>
          <Link href="/signin" className={textLink}>
            {t("auth.goToSignIn")}
          </Link>
        </div>
      )}
      {(isUsable || submitting) && (
        <>
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{t("auth.inviteTitle")}</h2>
            <p className="text-stone-600 dark:text-stone-400">{t("auth.inviteHint")}</p>
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
                autoComplete="new-password"
                minLength={8}
                required
                className={`${field} px-3 py-3`}
              />
              <span className="text-sm text-stone-500">{t("auth.passwordHint")}</span>
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
              {t("auth.createAccount")}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
