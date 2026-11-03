import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { translate as t } from "@/lib/i18n";
import { themeScript } from "@/lib/theme";
import "./globals.css";

// Served by the app (next/font), so the font works offline.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: t("app.name"),
  description: t("app.description"),
  applicationName: t("app.name"),
  appleWebApp: { capable: true, title: t("app.name"), statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // Next only emits mobile-web-app-capable; older iOS needs the Apple-prefixed tag.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#10161c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ConvexAuthNextjsServerProvider>
      {/* The script sets data-theme on <html> before React hydrates (lib/theme.ts). */}
      <html lang="fi" className={`h-full antialiased ${manrope.variable}`} suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body className="min-h-full">
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
