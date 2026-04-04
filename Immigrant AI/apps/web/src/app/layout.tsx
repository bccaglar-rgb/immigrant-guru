import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: {
    default: "Immigrant Guru",
    template: "%s | Immigrant Guru"
  },
  description: "AI-powered immigration strategy platform. Compare visa pathways, build your profile, and take action with clarity.",
  metadataBase: new URL("http://localhost:3000")
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} font-sans`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
