import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV === "development";

const CSP = [
  "default-src 'self'",
  // Scripts: self + Google Analytics + Next.js inline chunks
  // unsafe-eval removed — Next.js production builds do not require it.
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://admin.caglarlabs.com",
  // Styles: self + inline (Next.js requires this)
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Fonts
  "font-src 'self' https://fonts.gstatic.com",
  // Images: self + CDN sources
  "img-src 'self' data: blob: https:",
  // Connections: API + analytics + Stripe
  `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? ""} https://www.google-analytics.com https://analytics.google.com https://api.stripe.com https://admin.caglarlabs.com wss:`,
  // Stripe payment iframe
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  // Disallow object embeds
  "object-src 'none'",
  // Restrict base tag
  "base-uri 'self'",
  // Require HTTPS for form submissions
  "form-action 'self'",
  // Prevent framing (belt + suspenders alongside X-Frame-Options)
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: isDev ? "" : CSP,
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: path.resolve(__dirname, "../..")
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: securityHeaders.filter((h) => h.value !== ""),
      },
      {
        // Cache static assets aggressively
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Don't cache HTML pages
        source: "/((?!_next/static|_next/image|favicon).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
