"use client";

import Link from "next/link";
import { useState } from "react";

import { Animate } from "@/components/ui/animate";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";

type Step = "email" | "code" | "newPassword" | "done";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (!email) { setError("Enter your email."); return; }
    setLoading(true); setError("");
    const res = await apiRequest({ method: "POST", path: "/auth/forgot-password", body: { email }, retries: 0, timeoutMs: 10000 });
    setLoading(false);
    if (!res.ok) { setError(res.errorMessage); return; }
    setStep("code");
  };

  const handleVerifyCode = async () => {
    if (!code) { setError("Enter the 6-digit code."); return; }
    setLoading(true); setError("");
    const res = await apiRequest({ method: "POST", path: "/auth/verify-reset-code", body: { email, code }, retries: 0, timeoutMs: 10000 });
    setLoading(false);
    if (!res.ok) { setError(res.errorMessage); return; }
    setStep("newPassword");
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
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
                  <h1 className="text-2xl font-semibold tracking-tight text-ink">Forgot your password?</h1>
                  <p className="mt-2 text-sm text-muted">Enter your email and we&apos;ll send you a reset code.</p>
                  <div className="mt-6 space-y-4">
                    <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                    {error && <p className="text-sm text-red">{error}</p>}
                    <Button fullWidth size="lg" onClick={handleSendCode} disabled={loading}>
                      {loading ? "Sending..." : "Send reset code"}
                    </Button>
                  </div>
                </>
              )}

              {step === "code" && (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight text-ink">Check your email</h1>
                  <p className="mt-2 text-sm text-muted">We sent a 6-digit code to <span className="font-medium text-ink">{email}</span></p>
                  <div className="mt-6 space-y-4">
                    <Input label="Reset code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
                    {error && <p className="text-sm text-red">{error}</p>}
                    <Button fullWidth size="lg" onClick={handleVerifyCode} disabled={loading}>
                      {loading ? "Verifying..." : "Verify code"}
                    </Button>
                    <button className="w-full text-sm text-accent hover:text-accent-hover" onClick={handleSendCode} type="button">
                      Resend code
                    </button>
                  </div>
                </>
              )}

              {step === "newPassword" && (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight text-ink">Set new password</h1>
                  <p className="mt-2 text-sm text-muted">Choose a new password for your account.</p>
                  <div className="mt-6 space-y-4">
                    <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 8 characters" />
                    {error && <p className="text-sm text-red">{error}</p>}
                    <Button fullWidth size="lg" onClick={handleResetPassword} disabled={loading}>
                      {loading ? "Resetting..." : "Reset password"}
                    </Button>
                  </div>
                </>
              )}

              {step === "done" && (
                <>
                  <div className="text-center">
                    <p className="text-4xl">&#10003;</p>
                    <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Password reset!</h1>
                    <p className="mt-2 text-sm text-muted">Your password has been updated. You can now sign in.</p>
                    <Link href="/sign-in" className="mt-6 inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover">
                      Sign in
                    </Link>
                  </div>
                </>
              )}

              {step !== "done" && (
                <p className="mt-6 text-center text-sm text-muted">
                  Remember your password?{" "}
                  <Link href="/sign-in" className="font-semibold text-accent hover:text-accent-hover">Sign in</Link>
                </p>
              )}

            </div>
          </Animate>
        </div>
      </section>
    </AppShell>
  );
}
