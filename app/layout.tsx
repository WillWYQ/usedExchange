import type { Metadata } from "next";
import "./globals.css";
import { siteConfig } from "@/content/config";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { BackgroundEffect } from "@/components/ui-adapters/BackgroundEffect";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.meta.description,
  metadataBase: new URL(siteConfig.baseUrl),
  openGraph: {
    siteName: siteConfig.name,
    locale: siteConfig.i18n.defaultLocale,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    ...(siteConfig.meta.twitterHandle
      ? { creator: `@${siteConfig.meta.twitterHandle}` }
      : {}),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={siteConfig.i18n.defaultLocale} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <LocaleProvider>
            <BackgroundEffect>
              <SiteHeader />
              <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
              <SiteFooter />
            </BackgroundEffect>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
