import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset, confirmPasswordReset } from "../services/authClient";

type View = "request" | "reset";

export default function ForgotPasswordPage() {
  const [view, setView] = useState<View>("request");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-[var(--panelAlt)] px-4 py-3 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--textSubtle)] focus:border-[var(--accent)]/50";
  const btnCls =
    "lp-cta-primary w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#e5b632] hover:shadow-[0_0_30px_rgba(245,197,66,0.3)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--accent)] disabled:hover:shadow-none";

  const spinner = (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );

  const onRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || loading) return;
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      if (res.devResetToken) {
        setResetToken(res.devResetToken);
        setView("reset");
        setMsg("Dev token auto-filled.");
      } else {
        setView("reset");
        setMsg("If an account exists with this email, a reset link has been sent.");
      }
    } catch (error: any) {
      // Always show generic message to avoid user enumeration
      setMsg("If an account exists with this email, a reset link has been sent.");
      setView("reset");
    } finally {
      setLoading(false);
    }
  };

  const onConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken || newPassword.length < 6 || loading) return;
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      await confirmPasswordReset(resetToken, newPassword);
      setMsg("Password reset successful! Redirecting to sign in...");
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch (error: any) {
      setErr(error?.message ?? "Failed to reset password");
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
            <img src="/favicon.svg" alt="Bitrium" className="mx-auto mb-3 h-16 w-16" />
            <h1 className="text-2xl font-bold tracking-[0.15em] text-[var(--text)]">BITRIUM</h1>
          </Link>
          <p className="mt-2 text-sm text-[var(--textSubtle)]">
            {view === "request" ? "Reset your password" : "Set new password"}
          </p>
        </div>

        {/* Card */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[var(--panel)]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(245,197,66,0.06) 0%, transparent 60%)" }}
          />

          {view === "request" && (
            <form onSubmit={onRequestReset} className="relative space-y-4 p-6 md:p-8">
              <div>
                <label htmlFor="forgot-email" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  className={inputCls}
                />
              </div>

              {err && (
                <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">
                  {err}
                </div>
              )}

              <button type="submit" disabled={!email.includes("@") || loading} className={btnCls}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">{spinner} Sending...</span>
                ) : (
                  "Send Reset Link"
                )}
              </button>

              <Link
                to="/login"
                className="block w-full text-center text-xs text-[var(--textSubtle)] transition-colors hover:text-[var(--text)]"
              >
                Back to Sign In
              </Link>
            </form>
          )}

          {view === "reset" && (
            <form onSubmit={onConfirmReset} className="relative space-y-4 p-6 md:p-8">
              {msg && (
                <div className="rounded-lg border border-[#6f765f] bg-[#1f251b] px-3 py-2 text-xs text-[#d8decf]">
                  {msg}
                </div>
              )}

              <div>
                <label htmlFor="reset-token" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">
                  Reset Token
                </label>
                <input
                  id="reset-token"
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste token from email"
                  className={inputCls}
                />
              </div>

              <div>
                <label htmlFor="reset-newpw" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">
                  New Password
                </label>
                <input
                  id="reset-newpw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  autoComplete="new-password"
                  className={inputCls}
                />
              </div>

              {err && (
                <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">
                  {err}
                </div>
              )}

              <button type="submit" disabled={!resetToken || newPassword.length < 6 || loading} className={btnCls}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">{spinner} Resetting...</span>
                ) : (
                  "Reset Password"
                )}
              </button>

              <Link
                to="/login"
                className="block w-full text-center text-xs text-[var(--textSubtle)] transition-colors hover:text-[var(--text)]"
              >
                Back to Sign In
              </Link>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-[var(--textSubtle)]">
          Remember your password?{" "}
          <Link to="/login" className="font-medium text-[var(--accent)] transition-colors hover:text-[#e5b632]">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
