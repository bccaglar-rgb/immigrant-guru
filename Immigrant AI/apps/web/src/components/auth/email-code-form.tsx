"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuthSession } from "@/hooks/use-auth-session";
import { requestEmailCode, verifyEmailCode } from "@/lib/auth-client";
import { resolveSafeAuthRedirectPath } from "@/lib/auth-redirect";

export function EmailCodeForm() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { establishSession, status } = useAuthSession();

  const emailParam = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const nextPath = useMemo(
    () => resolveSafeAuthRedirectPath(searchParams.get("next"), "/dashboard"),
    [searchParams]
  );

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(nextPath);
    }
  }, [nextPath, router, status]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // No email in query → bounce back to /sign-in
  useEffect(() => {
    if (!emailParam) router.replace("/sign-in");
  }, [emailParam, router]);

  const handleVerify = () => {
    if (isSubmitting) return;
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      setError(t("Enter the 6-digit code from your email."));
      return;
    }

    void (async () => {
      setIsSubmitting(true);
      setError(null);
      try {
        const result = await verifyEmailCode(emailParam, trimmed);
        if (!result.ok) {
          setError(result.errorMessage);
          return;
        }
        const established = await establishSession(result.data);
        if (!established.ok) {
          setError(established.errorMessage);
          return;
        }
        window.location.href = nextPath;
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !emailParam) return;
    setError(null);
    const result = await requestEmailCode(emailParam);
    if (!result.ok) {
      setError(result.errorMessage);
      return;
    }
    setResendCooldown(60);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{t("Check your email")}</h2>
        <p className="text-sm leading-relaxed text-muted">
          {t("We sent a 6-digit code to")}{" "}
          <span className="font-medium text-ink">{emailParam}</span>.{" "}
          {t("Enter it below to sign in.")}
        </p>
      </div>

      <div className="space-y-4">
        <Input
          autoComplete="one-time-code"
          disabled={isSubmitting}
          inputMode="numeric"
          label={t("Verification code")}
          maxLength={6}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && code.length === 6) {
              event.preventDefault();
              handleVerify();
            }
          }}
          placeholder="123456"
          value={code}
        />

        {error ? (
          <div className="rounded-xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
            {error}
          </div>
        ) : null}

        <Button
          disabled={isSubmitting || code.length < 6}
          fullWidth
          onClick={handleVerify}
          size="lg"
          type="button"
        >
          {isSubmitting ? t("Verifying...") : t("Sign in")}
        </Button>

        <button
          className="w-full text-sm text-accent transition-colors hover:text-accent-hover disabled:opacity-40"
          disabled={resendCooldown > 0}
          onClick={handleResend}
          type="button"
        >
          {resendCooldown > 0
            ? t("Resend code in {n}s", { n: resendCooldown })
            : t("Resend code")}
        </button>
      </div>

      <p className="text-sm text-muted">
        {t("Wrong email?")}{" "}
        <Link
          className="font-semibold text-accent transition-colors hover:text-accent-hover"
          href="/sign-in"
        >
          {t("Go back")}
        </Link>
      </p>
    </div>
  );
}
