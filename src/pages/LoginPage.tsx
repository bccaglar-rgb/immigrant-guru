import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../hooks/useAuthStore";
import { requestPasswordReset, confirmPasswordReset } from "../services/authClient";

type View = "login" | "forgot" | "reset";

export default function LoginPage() {
  const nav = useNavigate();
  const authLogin = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [show2FA, setShow2FA] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Password reset state
  const [view, setView] = useState<View>("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  const valid = email.includes("@") && password.length >= 1;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || loading) return;
    setErr("");
    setLoading(true);
    try {
      await authLogin(email, password, twoFactorCode || undefined);
      nav("/pricing");
    } catch (error: any) {
      const msg = error?.message ?? "Login failed";
      if (msg === "two_factor_required") {
        setShow2FA(true);
        setErr("");
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const onRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.includes("@") || loading) return;
    setErr("");
    setResetMsg("");
    setLoading(true);
    try {
      const res = await requestPasswordReset(resetEmail);
      if (res.devResetToken) {
        setResetToken(res.devResetToken);
        setView("reset");
        setResetMsg("Dev token auto-filled.");
      } else {
        setView("reset");
        setResetMsg("Reset link sent. Check your email and paste the token below.");
      }
    } catch (error: any) {
      setErr(error?.message ?? "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  const onConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken || newPassword.length < 6 || loading) return;
    setErr("");
    setResetMsg("");
    setLoading(true);
    try {
      await confirmPasswordReset(resetToken, newPassword);
      setResetMsg("Password reset successful! You can now sign in.");
      setTimeout(() => {
        setView("login");
        setResetMsg("");
        setResetToken("");
        setNewPassword("");
      }, 2000);
    } catch (error: any) {
      setErr(error?.message ?? "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full rounded-xl border border-white/10 bg-[var(--panelAlt)] px-4 py-3 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--textSubtle)] focus:border-[var(--accent)]/50";
  const btnCls = "lp-cta-primary w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#e5b632] hover:shadow-[0_0_30px_rgba(245,197,66,0.3)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--accent)] disabled:hover:shadow-none";

  const spinner = (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 text-[var(--textMuted)]">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <h1 className="text-2xl font-bold tracking-[0.15em] text-[var(--text)]">BITRIUM</h1>
          </Link>
          <p className="mt-2 text-sm text-[var(--textSubtle)]">
            {view === "login"
              ? show2FA ? "Enter your 2FA code" : "Welcome back"
              : view === "forgot" ? "Reset your password"
              : "Set new password"}
          </p>
        </div>

        {/* Card */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--panel)]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(245,197,66,0.06) 0%, transparent 60%)" }}
          />

          {/* ── Login Form ── */}
          {view === "login" && (
            <form onSubmit={onSubmit} className="relative space-y-4 p-6 md:p-8">
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">Email</label>
                <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" autoFocus className={inputCls} />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="login-password" className="text-xs font-medium text-[var(--textMuted)]">Password</label>
                  <button type="button" onClick={() => { setView("forgot"); setErr(""); setResetEmail(email); }} className="text-xs font-medium text-[var(--accent)] transition-colors hover:text-[#e5b632]">
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <input id="login-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--textSubtle)] hover:text-[var(--text)] transition-colors" tabIndex={-1}>
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 2FA Code — shown after initial login if account has 2FA enabled */}
              {show2FA && (
                <div>
                  <label htmlFor="login-2fa" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">
                    Two-Factor Authentication Code
                  </label>
                  <input
                    id="login-2fa"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    autoComplete="one-time-code"
                    autoFocus
                    className={inputCls}
                  />
                  <p className="mt-1 text-[10px] text-[var(--textSubtle)]">
                    Open your authenticator app and enter the 6-digit code
                  </p>
                </div>
              )}

              {err && <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">{err}</div>}

              <button type="submit" disabled={!valid || loading} className={btnCls}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">{spinner} Signing in...</span>
                ) : show2FA ? "Verify & Sign In" : "Sign In"}
              </button>
            </form>
          )}

          {/* ── Forgot Password Form ── */}
          {view === "forgot" && (
            <form onSubmit={onRequestReset} className="relative space-y-4 p-6 md:p-8">
              <div>
                <label htmlFor="forgot-email" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">Email</label>
                <input id="forgot-email" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" autoFocus className={inputCls} />
              </div>

              {err && <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">{err}</div>}

              <button type="submit" disabled={!resetEmail.includes("@") || loading} className={btnCls}>
                {loading ? <span className="flex items-center justify-center gap-2">{spinner} Sending...</span> : "Send Reset Link"}
              </button>

              <button type="button" onClick={() => { setView("login"); setErr(""); }} className="w-full text-center text-xs text-[var(--textSubtle)] transition-colors hover:text-[var(--text)]">
                Back to Sign In
              </button>
            </form>
          )}

          {/* ── Reset Password Form ── */}
          {view === "reset" && (
            <form onSubmit={onConfirmReset} className="relative space-y-4 p-6 md:p-8">
              {resetMsg && <div className="rounded-lg border border-[#6f765f] bg-[#1f251b] px-3 py-2 text-xs text-[#d8decf]">{resetMsg}</div>}

              <div>
                <label htmlFor="reset-token" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">Reset Token</label>
                <input id="reset-token" type="text" value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Paste token from email" className={inputCls} />
              </div>

              <div>
                <label htmlFor="reset-newpw" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">New Password</label>
                <input id="reset-newpw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" autoComplete="new-password" className={inputCls} />
              </div>

              {err && <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">{err}</div>}

              <button type="submit" disabled={!resetToken || newPassword.length < 6 || loading} className={btnCls}>
                {loading ? <span className="flex items-center justify-center gap-2">{spinner} Resetting...</span> : "Reset Password"}
              </button>

              <button type="button" onClick={() => { setView("login"); setErr(""); setResetMsg(""); }} className="w-full text-center text-xs text-[var(--textSubtle)] transition-colors hover:text-[var(--text)]">
                Back to Sign In
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-[var(--textSubtle)]">
          Don't have an account?{" "}
          <Link to="/signup" className="font-medium text-[var(--accent)] transition-colors hover:text-[#e5b632]">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
