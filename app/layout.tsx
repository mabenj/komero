import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Nunito, Young_Serif } from "next/font/google";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { translate as t } from "@/lib/i18n";
import "./globals.css";

// PROTOTYPE: candidate title fonts, switched with ?font= (see Koti.prototype.tsx).
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito" });
const youngSerif = Young_Serif({ subsets: ["latin"], weight: "400", variable: "--font-young" });

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
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="fi" className={`h-full antialiased ${bricolage.variable} ${nunito.variable} ${youngSerif.variable}`}>
        <body className="min-h-full">
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
