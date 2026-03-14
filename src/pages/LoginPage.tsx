import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, setAuthToken } from "../services/authClient";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@bitrium.local");
  const [password, setPassword] = useState("Admin12345!");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [err, setErr] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      const res = await login(email, password, twoFactorCode || undefined);
      setAuthToken(res.token);
      nav("/pricing");
    } catch (error: any) {
      setErr(error?.message ?? "Login failed");
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] p-6 text-[var(--textMuted)]">
      <div className="mx-auto max-w-md rounded-xl border border-[var(--borderSoft)] bg-[var(--panel)] p-4">
        <h1 className="text-xl font-semibold text-[var(--text)]">Login</h1>
        <p className="text-xs">Email/password + optional 2FA code.</p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)]" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="w-full rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)]" />
          <input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} placeholder="2FA code (if enabled)" className="w-full rounded border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)]" />
          <button type="submit" className="w-full rounded border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">Login</button>
        </form>
        {err ? <p className="mt-2 text-xs text-[#d6b3af]">{err}</p> : null}
        <p className="mt-3 text-xs">No account? <Link to="/signup" className="text-[var(--accent)]">Sign up</Link></p>
      </div>
    </main>
  );
}
