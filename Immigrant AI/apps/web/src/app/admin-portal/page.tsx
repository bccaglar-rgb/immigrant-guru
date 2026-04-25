"use client";

export const dynamic = "force-dynamic";

import { useEffect, useEffectEvent, useState } from "react";

import { DashboardAdminPage } from "@/components/dashboard/dashboard-admin-page";

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!)) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 < Date.now();
  } catch {
    return false;
  }
}

export default function AdminPortalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [checked, setChecked] = useState(false);

  const onMount = useEffectEvent(() => {
    const stored = sessionStorage.getItem("admin-portal-token");
    if (!stored) {
      window.location.href = "/admin-portal/login?reason=no_session";
      return;
    }
    if (isTokenExpired(stored)) {
      sessionStorage.removeItem("admin-portal-token");
      sessionStorage.removeItem("admin-portal-email");
      window.location.href = "/admin-portal/login?reason=expired";
      return;
    }
    setToken(stored);
    setEmail(sessionStorage.getItem("admin-portal-email") ?? "");
    setChecked(true);
  });

  useEffect(() => {
    onMount();
  }, []);

  if (!checked || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0d12]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
          <p className="text-sm text-white/40">Loading console…</p>
        </div>
      </div>
    );
  }

  function handleSignOut() {
    sessionStorage.removeItem("admin-portal-token");
    sessionStorage.removeItem("admin-portal-email");
    window.location.href = "/admin-portal/login";
  }

  function handleSessionExpired() {
    sessionStorage.removeItem("admin-portal-token");
    sessionStorage.removeItem("admin-portal-email");
    window.location.href = "/admin-portal/login?reason=expired";
  }

  return (
    <DashboardAdminPage
      overrideToken={token}
      userEmail={email}
      onSignOut={handleSignOut}
      onSessionExpired={handleSessionExpired}
    />
  );
}
