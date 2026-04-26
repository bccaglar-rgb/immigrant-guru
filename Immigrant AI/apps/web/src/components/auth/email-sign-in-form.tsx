"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { SocialSignInButtons } from "@/components/auth/social-sign-in-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuthSession } from "@/hooks/use-auth-session";
import { requestEmailCode } from "@/lib/auth-client";
import { resolveSafeAuthRedirectPath } from "@/lib/auth-redirect";

export function EmailSignInForm() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useAuthSession();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextPath = useMemo(
    () => resolveSafeAuthRedirectPath(searchParams.get("next"), "/dashboard"),
    [searchParams]
  );

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(nextPath);
    }
  }, [nextPath, router, status]);

  const emailSchema = z.string().email(t("Enter a valid email address."));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError(undefined);
    setFormError(null);

    const trimmed = email.trim().toLowerCase();
    const parsed = emailSchema.safeParse(trimmed);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? t("Enter a valid email address."));
      return;
    }

    void (async () => {
      setIsSubmitting(true);
      try {
        const result = await requestEmailCode(parsed.data);
        if (!result.ok) {
          setFormError(result.errorMessage);
          return;
        }
        const params = new URLSearchParams({ email: parsed.data });
        const nextParam = searchParams.get("next");
        if (nextParam) params.set("next", nextParam);
        router.push(`/sign-in/code?${params.toString()}`);
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const passwordHref = (() => {
    const nextParam = searchParams.get("next");
    return nextParam
      ? `/sign-in/password?next=${encodeURIComponent(nextParam)}`
      : "/sign-in/password";
  })();

  const signUpHref =
    nextPath !== "/dashboard"
      ? `/sign-up?next=${encodeURIComponent(nextPath)}`
      : "/sign-up";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{t("Welcome back")}</h2>
        <p className="text-sm leading-relaxed text-muted">
          {t("Continue with email, Google, or Apple.")}
        </p>
      </div>

      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        <Input
          autoComplete="email"
          disabled={isSubmitting}
          error={emailError}
          label={t("Email")}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailError(undefined);
            setFormError(null);
          }}
          placeholder="you@example.com"
          type="email"
          value={email}
        />

        {formError ? (
          <div className="rounded-xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
            {formError}
          </div>
        ) : null}

        <Button disabled={isSubmitting} fullWidth size="lg" type="submit">
          {isSubmitting ? t("Sending code...") : t("Continue with email")}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs uppercase tracking-[0.2em] text-muted">{t("or")}</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <SocialSignInButtons nextPath={nextPath} onError={setFormError} />

      <div className="flex flex-col items-center gap-3 pt-2">
        <Link
          className="text-sm text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
          href={passwordHref}
        >
          {t("Use password instead")}
        </Link>
        <p className="text-sm text-muted">
          {t("Need an account?")}{" "}
          <Link
            className="font-semibold text-accent transition-colors hover:text-accent-hover"
            href={signUpHref}
          >
            {t("Create one")}
          </Link>
        </p>
      </div>
    </div>
  );
}
