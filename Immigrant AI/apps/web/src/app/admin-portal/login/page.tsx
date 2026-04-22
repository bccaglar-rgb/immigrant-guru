"use client";

import { useState } from "react";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

function getReason(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("reason");
}

export default function AdminLoginPage() {
  const reason = getReason();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!loginRes.ok) {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }

      const loginData = (await loginRes.json()) as { access_token: string };
      const token = loginData.access_token;

      const statsRes = await fetch(`${API_URL}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (statsRes.status === 403) {
        setError("This account does not have admin access.");
        setLoading(false);
        return;
      }
      if (!statsRes.ok) {
        setError("Failed to verify admin access.");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("admin-portal-token", token);
      sessionStorage.setItem("admin-portal-email", email);
      window.location.href = "/admin-portal";
    } catch {
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0d12] px-4 py-10">
      {/* Animated gradient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-[420px] w-[420px] rounded-full bg-accent/30 blur-[120px]" />
        <div className="absolute top-1/2 -right-40 h-[480px] w-[480px] rounded-full bg-indigo-500/20 blur-[140px]" />
        <div className="absolute -bottom-40 left-1/3 h-[360px] w-[360px] rounded-full bg-cyan-400/10 blur-[120px]" />
      </div>

      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-indigo-500 shadow-[0_12px_40px_-8px_rgba(99,102,241,0.6)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <p className="mt-5 text-xl font-black tracking-tight text-white">
            Immigrant<span className="text-accent">Guru</span>
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Admin Console</p>
          </div>
        </div>

        {reason === "expired" && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
            <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Your session has expired. Please sign in again.</span>
          </div>
        )}

        {/* Card */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back</h1>
            <p className="mt-1 text-sm text-white/50">Sign in to the operations dashboard.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/50">
                Email
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent/60 focus:bg-white/10 focus:ring-2 focus:ring-accent/20"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/50">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-12 text-sm text-white outline-none transition focus:border-accent/60 focus:bg-white/10 focus:ring-2 focus:ring-accent/20"
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/40 transition hover:bg-white/5 hover:text-white/80"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-3.5 py-2.5 text-sm text-red-300">
                <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-accent to-indigo-500 px-4 py-3 text-sm font-bold text-white shadow-[0_8px_24px_-6px_rgba(99,102,241,0.5)] transition hover:shadow-[0_12px_32px_-4px_rgba(99,102,241,0.7)] disabled:opacity-60"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
                      <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </span>
            </button>
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
            <svg className="shrink-0 text-amber-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <p className="text-[11px] text-amber-200/80">
              Restricted area. Access attempts are logged and rate-limited.
            </p>
          </div>
        </form>

        <p className="mt-6 text-center text-[11px] text-white/30">
          © {new Date().getFullYear()} Immigrant Guru · Internal tools
        </p>
      </div>
    </div>
  );
}
