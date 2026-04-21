"use client";

import { useEffect, useState } from "react";

import { DashboardAdminPage } from "@/components/dashboard/dashboard-admin-page";

export default function AdminPortalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin-portal-token");
    if (!stored) {
      window.location.href = "/admin-portal/login";
      return;
    }
    setToken(stored);
    setChecked(true);
  }, []);

  if (!checked || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return <AdminPortalShell token={token} />;
}

function AdminPortalShell({ token }: { token: string }) {
  const email = sessionStorage.getItem("admin-portal-email") ?? "";

  function handleSignOut() {
    sessionStorage.removeItem("admin-portal-token");
    sessionStorage.removeItem("admin-portal-email");
    window.location.href = "/admin-portal/login";
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white px-6 py-3.5">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between">
          <p className="text-base font-black tracking-tight text-ink">
            Immigrant<span className="text-accent">Guru</span>
            <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
              Admin
            </span>
          </p>
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted">{email}</p>
            <button
              onClick={handleSignOut}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-ink/5 hover:text-ink"
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-6 py-8">
        <DashboardAdminPage overrideToken={token} />
      </main>
    </div>
  );
}
