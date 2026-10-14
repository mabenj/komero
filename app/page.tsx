"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { lastTab } from "@/lib/lastTab";

/** The app's start URL: reopen the last used tab. */
export default function StartPage() {
  const router = useRouter();
  useEffect(() => router.replace(`/${lastTab()}`), [router]);
  return null;
}
