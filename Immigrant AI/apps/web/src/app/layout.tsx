import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body"
});

const SITE_URL = "https://immigrant.guru";
const SITE_NAME = "Immigrant Guru";
const SITE_DESCRIPTION = "AI-powered immigration strategy platform. Compare visa pathways, build your profile, score your readiness, and get personalized Plan A/B/C recommendations.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1d1f" }
  ]
};

export const metadata: Metadata = {
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
    locale: "en_US",
    url: SITE_URL,
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
    canonical: SITE_URL
  },
  category: "technology"
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <head>
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
      </head>
      <body className={`${bodyFont.variable} font-sans`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
