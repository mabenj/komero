import type { MetadataRoute } from "next";
import { translate as t } from "@/lib/i18n";

/** Lets Members add Komero to the home screen; no service worker (ADR-0001). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t("app.name"),
    short_name: t("app.name"),
    description: t("app.description"),
    lang: "fi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // The light page grey; the manifest has no dark variant, the viewport theme colour covers dark mode.
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // The glyph sits inside the central safe zone, so the same image works as maskable.
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
