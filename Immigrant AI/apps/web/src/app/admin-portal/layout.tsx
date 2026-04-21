import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "@/app/globals.css";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Admin — Immigrant Guru",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0d12",
};

export const dynamic = "force-dynamic";

export default function AdminPortalLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={bodyFont.variable}>
      <body className="min-h-screen bg-canvas font-body antialiased">
        {children}
      </body>
    </html>
  );
}
