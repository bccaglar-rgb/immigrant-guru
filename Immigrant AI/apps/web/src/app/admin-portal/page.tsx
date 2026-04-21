"use client";

import { useEffect, useState } from "react";

import { DashboardAdminPage } from "@/components/dashboard/dashboard-admin-page";

export default function AdminPortalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin-portal-token");
    if (!stored) {
      window.location.href = "/admin-portal/login";
      return;
    }
    setToken(stored);
    setEmail(sessionStorage.getItem("admin-portal-email") ?? "");
    setChecked(true);
  }, []);

  if (!checked || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  function handleSignOut() {
    sessionStorage.removeItem("admin-portal-token");
    sessionStorage.removeItem("admin-portal-email");
    window.location.href = "/admin-portal/login";
  }

  return <DashboardAdminPage overrideToken={token} userEmail={email} onSignOut={handleSignOut} />;
}
