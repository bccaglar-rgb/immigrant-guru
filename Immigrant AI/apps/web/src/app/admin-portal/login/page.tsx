"use client";

import { useState } from "react";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!loginRes.ok) {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }

      const loginData = await loginRes.json() as { access_token: string };
      const token = loginData.access_token;

      // Verify admin access
      const statsRes = await fetch(`${API_URL}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-2xl font-black tracking-tight text-ink">
            Immigrant<span className="text-accent">Guru</span>
          </p>
          <p className="mt-1 text-sm text-muted">Admin Portal</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
              placeholder="admin@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red/5 px-4 py-2.5 text-sm text-red">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
