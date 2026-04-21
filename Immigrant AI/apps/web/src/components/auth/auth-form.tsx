"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/hooks/use-auth-session";
import { loginWithPassword, registerUser, sendVerificationCode, verifyEmail } from "@/lib/auth-client";
import { resolveSafeAuthRedirectPath } from "@/lib/auth-redirect";
import type { AuthMode, RequestResult, AuthSessionSeed } from "@/types/auth";

type AuthFormProps = Readonly<{
  mode: AuthMode;
}>;

type FormStep = "form" | "verify";
type FieldErrors = Partial<Record<"email" | "firstName" | "lastName" | "password" | "confirmPassword", string>>;

const signInSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must contain at least 8 characters.")
});

const signUpSchema = z
  .object({
    firstName: z.string().trim().max(100, "First name is too long.").optional(),
    lastName: z.string().trim().max(100, "Last name is too long.").optional(),
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Password must contain at least 8 characters."),
    confirmPassword: z.string().min(8, "Confirm your password.")
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { establishSession, status } = useAuthSession();
  const [step, setStep] = useState<FormStep>("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [formState, setFormState] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const isSignUp = mode === "sign-up";
  const nextPath = useMemo(
    () =>
      resolveSafeAuthRedirectPath(
        searchParams.get("next"),
        isSignUp ? "/onboarding" : "/dashboard"
      ),
    [isSignUp, searchParams]
  );

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(nextPath);
    }
  }, [nextPath, router, status]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleChange = (field: keyof typeof formState, value: string) => {
    setFormState((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const enterVerifyStep = (email: string) => {
    setPendingEmail(email);
    setVerificationCode("");
    setFormError(null);
    setResendCooldown(60);
    setStep("verify");
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setFormError(null);
    const result = await sendVerificationCode(pendingEmail);
    if (!result.ok) {
      setFormError(result.errorMessage);
      return;
    }
    setResendCooldown(60);
  };

  const handleVerify = () => {
    if (isSubmitting) return;
    const code = verificationCode.trim();
    if (!code) {
      setFormError("Enter the 6-digit code from your email.");
      return;
    }

    const submit = async () => {
      setIsSubmitting(true);
      setFormError(null);

      try {
        const result = await verifyEmail(pendingEmail, code);
        if (!result.ok) {
          setFormError(result.errorMessage);
          return;
        }

        const established = await establishSession(result.data);
        if (!established.ok) {
          console.warn("verify-email: post-verify session hydrate failed", established.errorMessage);
        }

        // Full navigation so the server-side auth context is fresh.
        window.location.href = nextPath;
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    };

    void submit();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const nextErrors: FieldErrors = {};
    const applyErrors = (issues: Array<{ path: (string | number)[]; message: string }>) => {
      for (const issue of issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in nextErrors)) {
          nextErrors[field as keyof FieldErrors] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
    };

    const submit = async () => {
      setIsSubmitting(true);
      let result: RequestResult<AuthSessionSeed>;

      try {
        if (isSignUp) {
          const validation = signUpSchema.safeParse(formState);
          if (!validation.success) {
            applyErrors(validation.error.issues);
            return;
          }

          const registerResult = await registerUser({
            email: validation.data.email,
            password: validation.data.password,
            firstName: validation.data.firstName?.trim() || undefined,
            lastName: validation.data.lastName?.trim() || undefined
          });

          if (!registerResult.ok) {
            setFormError(registerResult.errorMessage);
            return;
          }

          enterVerifyStep(validation.data.email);
          return;
        } else {
          const validation = signInSchema.safeParse(formState);
          if (!validation.success) {
            applyErrors(validation.error.issues);
            return;
          }

          result = await loginWithPassword(validation.data);

          if (!result.ok) {
            // Email not verified — show verification step
            if (result.status === 403) {
              enterVerifyStep(validation.data.email);
              return;
            }
            setFormError(result.errorMessage);
            return;
          }
        }

        const established = await establishSession(result.data);
        if (!established.ok) {
          setFormError(established.errorMessage);
          return;
        }

        router.replace(nextPath);
        router.refresh();
      } finally {
        setIsSubmitting(false);
      }
    };

    void submit();
  };

  // ── Verification step ──────────────────────────────────────────────────────
  if (step === "verify") {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Check your email</h2>
          <p className="text-sm leading-relaxed text-muted">
            We sent a 6-digit code to{" "}
            <span className="font-medium text-ink">{pendingEmail}</span>. Enter it below to
            verify your account.
          </p>
        </div>

        <div className="space-y-4">
          <Input
            autoComplete="one-time-code"
            disabled={isSubmitting}
            inputMode="numeric"
            label="Verification code"
            maxLength={6}
            onChange={(e) => {
              setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              setFormError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && verificationCode.length === 6) {
                e.preventDefault();
                handleVerify();
              }
            }}
            placeholder="123456"
            value={verificationCode}
          />

          {formError ? (
            <div className="rounded-xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
              {formError}
            </div>
          ) : null}

          <Button
            disabled={isSubmitting || verificationCode.length < 6}
            fullWidth
            size="lg"
            onClick={handleVerify}
            type="button"
          >
            {isSubmitting ? "Verifying..." : "Verify email"}
          </Button>

          <button
            className="w-full text-sm text-accent hover:text-accent-hover transition-colors disabled:opacity-40"
            disabled={resendCooldown > 0}
            onClick={handleResendCode}
            type="button"
          >
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
          </button>
        </div>

        <p className="text-sm text-muted">
          Wrong email?{" "}
          <button
            className="font-semibold text-accent hover:text-accent-hover transition-colors"
            onClick={() => { setStep("form"); setFormError(null); }}
            type="button"
          >
            Go back
          </button>
        </p>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          {isSignUp
            ? "Start with the essentials and complete your immigration profile later."
            : "Sign in to continue your immigration strategy."}
        </p>
      </div>

      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
        {isSignUp ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              autoComplete="given-name"
              disabled={isSubmitting}
              error={fieldErrors.firstName}
              label="First name"
              onChange={(event) => handleChange("firstName", event.target.value)}
              placeholder="Aylin"
              value={formState.firstName}
            />
            <Input
              autoComplete="family-name"
              disabled={isSubmitting}
              error={fieldErrors.lastName}
              label="Last name"
              onChange={(event) => handleChange("lastName", event.target.value)}
              placeholder="Demir"
              value={formState.lastName}
            />
          </div>
        ) : null}

        <Input
          autoComplete="email"
          disabled={isSubmitting}
          error={fieldErrors.email}
          label="Email"
          onChange={(event) => handleChange("email", event.target.value)}
          placeholder="you@example.com"
          type="email"
          value={formState.email}
        />

        <Input
          autoComplete={isSignUp ? "new-password" : "current-password"}
          disabled={isSubmitting}
          error={fieldErrors.password}
          label="Password"
          onChange={(event) => handleChange("password", event.target.value)}
          placeholder="Minimum 8 characters"
          type="password"
          value={formState.password}
        />

        {isSignUp ? (
          <Input
            autoComplete="new-password"
            disabled={isSubmitting}
            error={fieldErrors.confirmPassword}
            label="Confirm password"
            onChange={(event) =>
              handleChange("confirmPassword", event.target.value)
            }
            placeholder="Repeat your password"
            type="password"
            value={formState.confirmPassword}
          />
        ) : null}

        {formError ? (
          <div className="rounded-xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
            {formError}
          </div>
        ) : null}

        <Button disabled={isSubmitting} fullWidth size="lg" type="submit">
          {isSubmitting
            ? isSignUp
              ? "Creating account..."
              : "Signing in..."
            : isSignUp
              ? "Create account"
              : "Sign in"}
        </Button>

        {!isSignUp && (
          <div className="text-center">
            <Link href="/forgot-password" className="text-sm text-muted hover:text-accent transition-colors">
              Forgot your password?
            </Link>
          </div>
        )}
      </form>

      <p className="text-sm text-muted">
        {isSignUp ? "Already have an account?" : "Need an account?"}{" "}
        <Link
          className="font-semibold text-accent transition-colors hover:text-accent-hover"
          href={
            isSignUp
              ? nextPath !== "/onboarding"
                ? `/sign-in?next=${encodeURIComponent(nextPath)}`
                : "/sign-in"
              : nextPath !== "/dashboard"
                ? `/sign-up?next=${encodeURIComponent(nextPath)}`
                : "/sign-up"
          }
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
