"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Animate } from "@/components/ui/animate";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { apiRequest } from "@/lib/api-client";

type Step = "email" | "code" | "newPassword" | "done";

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (!email) { setError(t("Enter your email.")); return; }
    setLoading(true); setError("");
    const res = await apiRequest({ method: "POST", path: "/auth/forgot-password", body: { email }, retries: 0, timeoutMs: 10000 });
    setLoading(false);
    if (!res.ok) { setError(res.errorMessage); return; }
    setStep("code");
  };

  const handleVerifyCode = async () => {
    if (!code) { setError(t("Enter the 6-digit code.")); return; }
    setLoading(true); setError("");
    const res = await apiRequest({ method: "POST", path: "/auth/verify-reset-code", body: { email, code }, retries: 0, timeoutMs: 10000 });
    setLoading(false);
    if (!res.ok) { setError(res.errorMessage); return; }
    setStep("newPassword");
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) { setError(t("Password must be at least 8 characters.")); return; }
    setLoading(true); setError("");
    const res = await apiRequest({ method: "POST", path: "/auth/reset-password", body: { email, code, new_password: newPassword }, retries: 0, timeoutMs: 10000 });
    setLoading(false);
    if (!res.ok) { setError(res.errorMessage); return; }
    setStep("done");
  };

  return (
    <AppShell>
      <section className="flex min-h-[calc(100vh-12rem)] items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <Animate animation="fade-up" duration={600}>
            <div className="glass-card rounded-3xl p-8">

              {step === "email" && (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("Forgot your password?")}</h1>
                  <p className="mt-2 text-sm text-muted">{t("Enter your email and we'll send you a reset code.")}</p>
                  <div className="mt-6 space-y-4">
                    <Input label={t("Email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                    {error && <p className="text-sm text-red">{error}</p>}
                    <Button fullWidth size="lg" onClick={handleSendCode} disabled={loading}>
                      {loading ? t("Sending...") : t("Send reset code")}
                    </Button>
                  </div>
                </>
              )}

              {step === "code" && (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("Check your email")}</h1>
                  <p className="mt-2 text-sm text-muted">{t("We sent a 6-digit code to")} <span className="font-medium text-ink">{email}</span></p>
                  <div className="mt-6 space-y-4">
                    <Input label={t("Reset code")} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
                    {error && <p className="text-sm text-red">{error}</p>}
                    <Button fullWidth size="lg" onClick={handleVerifyCode} disabled={loading}>
                      {loading ? t("Verifying...") : t("Verify code")}
                    </Button>
                    <button className="w-full text-sm text-accent hover:text-accent-hover" onClick={handleSendCode} type="button">
                      {t("Resend code")}
                    </button>
                  </div>
                </>
              )}

              {step === "newPassword" && (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("Set new password")}</h1>
                  <p className="mt-2 text-sm text-muted">{t("Choose a new password for your account.")}</p>
                  <div className="mt-6 space-y-4">
                    <Input label={t("New password")} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("Minimum 8 characters")} />
                    {error && <p className="text-sm text-red">{error}</p>}
                    <Button fullWidth size="lg" onClick={handleResetPassword} disabled={loading}>
                      {loading ? t("Resetting...") : t("Reset password")}
                    </Button>
                  </div>
                </>
              )}

              {step === "done" && (
                <>
                  <div className="text-center">
                    <p className="text-4xl">&#10003;</p>
                    <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{t("Password reset!")}</h1>
                    <p className="mt-2 text-sm text-muted">{t("Your password has been updated. You can now sign in.")}</p>
                    <Link href="/sign-in" className="mt-6 inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover">
                      {t("Sign in")}
                    </Link>
                  </div>
                </>
              )}

              {step !== "done" && (
                <p className="mt-6 text-center text-sm text-muted">
                  {t("Remember your password?")}{" "}
                  <Link href="/sign-in" className="font-semibold text-accent hover:text-accent-hover">{t("Sign in")}</Link>
                </p>
              )}

            </div>
          </Animate>
        </div>
      </section>
    </AppShell>
  );
}
