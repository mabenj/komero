"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { I18nProvider } from "@/lib/i18n";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <MemberLanguage>{children}</MemberLanguage>
    </ConvexAuthNextjsProvider>
  );
}

/** The UI follows the signed-in Member's language, not the phone's; Finnish otherwise. */
function MemberLanguage({ children }: { children: ReactNode }) {
  const me = useQuery(api.members.me);
  return <I18nProvider lang={me?.language ?? "fi"}>{children}</I18nProvider>;
}
