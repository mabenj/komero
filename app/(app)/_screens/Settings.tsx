"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActivityList } from "@/components/ActivityList";
import { LanguagePicker } from "@/components/LanguagePicker";
import { LocationsSettings } from "@/components/LocationsSettings";
import { api } from "@/convex/_generated/api";
import { useT } from "@/lib/i18n";
import { cardList, field, primaryButton, secondaryButton } from "@/lib/styles";

export default function SettingsScreen() {
  const t = useT();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const me = useQuery(api.members.me);

  async function logOut() {
    await signOut();
    router.replace("/signin");
  }

  return (
    <div className="flex flex-col gap-8">
      <LocationsSettings />
      <Members />
      <InviteLink />
      <LanguagePicker />
      <div className="flex flex-col gap-3">
        {me && <p className="text-stone-600 dark:text-stone-400">{t("settings.signedInAs", { email: me.email })}</p>}
        <button
          type="button"
          onClick={logOut}
          className={`${secondaryButton} py-3 text-lg`}
        >
          {t("settings.logOut")}
        </button>
      </div>
      {/* Last, since it can be long. */}
      <ActivityFeed />
    </div>
  );
}

function Members() {
  const t = useT();
  const members = useQuery(api.members.list);
  const me = useQuery(api.members.me);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t("settings.members")}</h2>
      <ul className={cardList}>
        {members?.map((member) => (
          <li key={member._id} className="px-3 py-3">
            {member.email}
            {member._id === me?._id && <span className="ml-1 text-stone-500">{t("settings.you")}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityFeed() {
  const t = useT();
  const activities = useQuery(api.activities.feed);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t("activity.feed")}</h2>
      <ActivityList activities={activities} />
    </section>
  );
}

function InviteLink() {
  const t = useT();
  const createInvite = useMutation(api.invites.create);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function create() {
    const token = await createInvite();
    setLink(`${window.location.origin}/invite/${token}`);
    setCopied(false);
  }

  async function share(url: string) {
    try {
      await navigator.share({ text: t("settings.inviteShareText"), url });
    } catch {
      // The person closed the share sheet.
    }
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  const buttonClass = `${secondaryButton} flex-1 py-3`;

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={create}
        className={`${primaryButton} py-3 text-lg`}
      >
        {t("settings.createInvite")}
      </button>
      <p className="text-sm text-stone-500">{t("settings.inviteHint")}</p>
      {link && (
        <div className="flex flex-col gap-2">
          <input
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            className={`${field} px-3 py-3 text-sm`}
          />
          <div className="flex gap-2">
            {canShare && (
              <button type="button" onClick={() => share(link)} className={buttonClass}>
                {t("settings.share")}
              </button>
            )}
            <button type="button" onClick={() => copy(link)} className={buttonClass}>
              {copied ? t("settings.copied") : t("settings.copy")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
