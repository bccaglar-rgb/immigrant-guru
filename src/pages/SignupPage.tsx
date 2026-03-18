import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../hooks/useAuthStore";

export default function SignupPage() {
  const nav = useNavigate();
  const authSignup = useAuthStore((s) => s.signup);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = email.includes("@") && password.length >= 8;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setErr("");
    setLoading(true);
    try {
      await authSignup(email, password);
      nav("/pricing");
    } catch (error: any) {
      setErr(error?.message ?? "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 text-[var(--textMuted)]">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <h1 className="text-2xl font-bold tracking-[0.15em] text-[var(--text)]">BITRIUM</h1>
          </Link>
          <p className="mt-2 text-sm text-[var(--textSubtle)]">Create your account</p>
        </div>

        {/* Card */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--panel)]">
          {/* Glow */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(245,197,66,0.06) 0%, transparent 60%)" }}
          />

          <form onSubmit={onSubmit} className="relative space-y-4 p-6 md:p-8">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-[var(--panelAlt)] px-4 py-3 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--textSubtle)] focus:border-[var(--accent)]/50"
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                className="w-full rounded-xl border border-white/10 bg-[var(--panelAlt)] px-4 py-3 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--textSubtle)] focus:border-[var(--accent)]/50"
              />
              {password.length > 0 && password.length < 8 && (
                <p className="mt-1 text-[11px] text-[var(--textSubtle)]">At least 8 characters</p>
              )}
            </div>

            {/* Error */}
            {err ? (
              <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">{err}</div>
            ) : null}

            {/* Submit */}
            <button
              type="submit"
              disabled={!valid || loading}
              className="lp-cta-primary w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#e5b632] hover:shadow-[0_0_30px_rgba(245,197,66,0.3)] disabled:opacity-50 disabled:hover:shadow-none"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-[var(--textSubtle)]">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-[var(--accent)] transition-colors hover:text-[#e5b632]">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
