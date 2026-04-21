import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { AuthProvider } from "@/components/auth/auth-provider";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { routing } from "@/i18n/routing";
import { getDocumentDirection, type LanguageCode } from "@/lib/i18n";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body"
});

const SITE_URL = "https://immigrant.guru";
const SITE_NAME = "Immigrant Guru";
const SITE_DESCRIPTION = "AI-powered immigration strategy platform. Compare visa pathways, build your profile, score your readiness, and get personalized Plan A/B/C recommendations.";

// Only prerender the default locale at build time. Other locales are
// server-rendered on demand so the deploy-time build doesn't multiply
// (static routes × 31 locales) into six-figure page counts that OOM the
// droplet. Subsequent requests cache at the CDN layer anyway.
export function generateStaticParams() {
  return [{ locale: routing.defaultLocale }];
}

// Force dynamic rendering for every descendant route. Pre-migration, most
// routes were implicitly SSR (due to client-only auth hooks reading
// localStorage); moving them under [locale] made them SSG-eligible and the
// prerender crashed because `useAuthSession` returns null in the server
// renderer. SEO per-locale URLs still work; we just give up static HTML for
// now. Phase 2 can selectively re-enable prerender for truly public pages.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1d1f" }
  ]
};

type LayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  // hreflang alternates: Google uses these to serve the right language variant
  // in search results. `as-needed` means English lives at `/`, others at `/<locale>`.
  const languages: Record<string, string> = {};
  for (const code of routing.locales) {
    languages[code] = code === routing.defaultLocale ? "/" : `/${code}`;
  }
  languages["x-default"] = "/";

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${SITE_NAME} - AI Immigration Strategy Platform`,
      template: `%s | ${SITE_NAME}`
    },
    description: SITE_DESCRIPTION,
    keywords: [
      "immigration",
      "visa strategy",
      "immigration AI",
      "visa pathway comparison",
      "immigration score",
      "EB-2 NIW",
      "immigration planning",
      "visa readiness",
      "immigration consultant AI",
      "green card strategy",
      "work visa",
      "immigration case management",
      "AI immigration advisor",
      "immigration profile builder"
    ],
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    applicationName: SITE_NAME,
    generator: "Next.js",
    referrer: "origin-when-cross-origin",
    formatDetection: {
      email: false,
      address: false,
      telephone: false
    },
    icons: {
      icon: [
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16.png", sizes: "16x16", type: "image/png" }
      ],
      apple: [
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
      ]
    },
    manifest: "/manifest.json",
    openGraph: {
      type: "website",
      locale,
      url: locale === routing.defaultLocale ? SITE_URL : `${SITE_URL}/${locale}`,
      siteName: SITE_NAME,
      title: `${SITE_NAME} - Navigate Immigration with Clarity`,
      description: SITE_DESCRIPTION,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} - AI-Powered Immigration Strategy Platform`
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: `${SITE_NAME} - AI Immigration Strategy Platform`,
      description: SITE_DESCRIPTION,
      images: ["/og-image.png"],
      creator: "@immigrantguru"
    },
    robots: {
      index: true,
      follow: true,
      nocache: false,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1
      }
    },
    alternates: {
      canonical: locale === routing.defaultLocale ? "/" : `/${locale}`,
      languages
    },
    category: "technology",
    verification: {
      google: process.env.NEXT_PUBLIC_GSC_VERIFICATION,
      other: process.env.NEXT_PUBLIC_BING_VERIFICATION
        ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFICATION }
        : undefined
    }
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale: rawLocale } = await params;
  // Fall back to English instead of calling notFound() — calling notFound()
  // before providers mount causes /_not-found to render [locale]/not-found.tsx
  // without AuthProvider, crashing on useAuthSession. Providers always render.
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;

  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = getDocumentDirection(locale as LanguageCode);

  return (
    <html lang={locale} dir={dir}>
      <head>
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
      </head>
      <body className={`${bodyFont.variable} font-sans`}>
        <GoogleAnalytics />
        <div className="aurora-bg" aria-hidden="true">
          <div className="orb-3" />
        </div>
        <div className="anim-page-enter relative z-[1]">
          <NextIntlClientProvider locale={locale} messages={messages}>
            <LocaleProvider>
              <AuthProvider>{children}</AuthProvider>
            </LocaleProvider>
          </NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}
