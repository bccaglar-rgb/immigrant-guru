import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../hooks/useAuthStore";
import { SocialLoginButtons } from "../components/SocialLoginButtons";

/* ── Password strength helpers ── */
interface PwRule { label: string; test: (pw: string) => boolean }
const PW_RULES: PwRule[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "At least 1 uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "At least 1 lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { label: "At least 1 number", test: (pw) => /[0-9]/.test(pw) },
  { label: "At least 1 special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

const getStrength = (pw: string): { level: number; label: string; color: string } => {
  const passed = PW_RULES.filter((r) => r.test(pw)).length;
  if (passed <= 1) return { level: 1, label: "Weak", color: "#ef4444" };
  if (passed <= 2) return { level: 2, label: "Fair", color: "#f97316" };
  if (passed <= 3) return { level: 3, label: "Medium", color: "#eab308" };
  if (passed <= 4) return { level: 4, label: "Strong", color: "#22c55e" };
  return { level: 5, label: "Very Strong", color: "#10b981" };
};

export default function SignupPage() {
  const nav = useNavigate();
  const authSignup = useAuthStore((s) => s.signup);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [enable2FA, setEnable2FA] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const allRulesPass = useMemo(() => PW_RULES.every((r) => r.test(password)), [password]);
  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const strength = useMemo(() => (password.length > 0 ? getStrength(password) : null), [password]);

  const valid =
    email.includes("@") &&
    allRulesPass &&
    passwordsMatch &&
    termsAccepted;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || loading) return;
    setErr("");
    setLoading(true);
    try {
      await authSignup(email, password);
      if (enable2FA) {
        nav("/settings?setup2fa=1");
      } else {
        nav("/pricing");
      }
    } catch (error: any) {
      setErr(error?.message ?? "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-[var(--panelAlt)] px-4 py-3 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--textSubtle)] focus:border-[var(--accent)]/50";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-8 text-[var(--textMuted)]">
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
              <label htmlFor="signup-email" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                className={inputCls}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="signup-password" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                autoComplete="new-password"
                className={inputCls}
              />

              {/* Strength Bar */}
              {password.length > 0 && strength && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-colors duration-300"
                        style={{ backgroundColor: i <= strength.level ? strength.color : "rgba(255,255,255,0.08)" }}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] font-medium" style={{ color: strength.color }}>
                    {strength.label}
                  </p>
                </div>
              )}

              {/* Password Rules */}
              {password.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {PW_RULES.map((rule) => {
                    const pass = rule.test(password);
                    return (
                      <li key={rule.label} className="flex items-center gap-1.5 text-[10px] transition-colors">
                        <span className="flex h-3 w-3 items-center justify-center">
                          {pass ? (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5.5L4 7.5L8 3" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <span className="h-1 w-1 rounded-full bg-white/20" />
                          )}
                        </span>
                        <span className={pass ? "text-emerald-400" : "text-[var(--textSubtle)]"}>
                          {rule.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="signup-confirm" className="mb-1.5 block text-xs font-medium text-[var(--textMuted)]">
                Confirm Password
              </label>
              <input
                id="signup-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                className={inputCls}
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1 text-[11px] text-red-400">Passwords do not match</p>
              )}
              {passwordsMatch && (
                <p className="mt-1 text-[11px] text-emerald-400">Passwords match</p>
              )}
            </div>

            {/* Terms Checkbox */}
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[var(--panelAlt)] accent-[var(--accent)]"
                aria-label="Accept terms of service"
              />
              <span className="text-[11px] leading-relaxed text-[var(--textSubtle)]">
                I have read and agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener" className="text-[var(--accent)] hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noopener" className="text-[var(--accent)] hover:underline">
                  Privacy Policy
                </a>
              </span>
            </label>

            {/* Optional 2FA Toggle */}
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={enable2FA}
                onChange={(e) => setEnable2FA(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-[var(--panelAlt)] accent-[var(--accent)]"
                aria-label="Enable two-factor authentication"
              />
              <span className="text-[11px] text-[var(--textSubtle)]">
                Enable 2FA for extra security{" "}
                <span className="opacity-50">(optional)</span>
              </span>
            </label>

            {/* Error */}
            {err && (
              <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">
                {err}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!valid || loading}
              className="lp-cta-primary w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#e5b632] hover:shadow-[0_0_30px_rgba(245,197,66,0.3)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--accent)] disabled:hover:shadow-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Creating account...
                </span>
              ) : (
                "Create Account"
              )}
            </button>

            <SocialLoginButtons mode="signup" />
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
