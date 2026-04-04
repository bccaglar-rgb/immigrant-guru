"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { useAuthSession } from "@/hooks/use-auth-session";

type ProtectedRouteProps = Readonly<{
  children: (context: {
    clearSession: () => void;
    retrySession: () => Promise<unknown>;
    session: NonNullable<ReturnType<typeof useAuthSession>["session"]>;
    user: NonNullable<ReturnType<typeof useAuthSession>["user"]>;
  }) => ReactNode;
  redirectTo?: string;
}>;

export function ProtectedRoute({
  children,
  redirectTo = "/sign-in?next=%2Fdashboard"
}: ProtectedRouteProps) {
  const router = useRouter();
  const { clearSession, error, retrySession, session, status, user } = useAuthSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(redirectTo);
    }
  }, [redirectTo, router, status]);

  if (status === "loading") {
    return (
      <div className="grid gap-5 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card className="h-48 animate-pulse p-6" key={index} />
        ))}
      </div>
    );
  }

  if (status === "unauthenticated" || !session || !user) {
    if (status === "error" && session) {
      return (
        <Card className="p-8">
          <h2 className="text-xl font-semibold tracking-tight text-accent">
            Session verification is temporarily unavailable
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted">
            {error ??
              "The platform could not verify the current session. Retry before signing out."}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent/90"
              onClick={() => {
                void retrySession();
              }}
              type="button"
            >
              Retry session
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:border-accent/30 hover:text-accent-hover"
              onClick={clearSession}
              type="button"
            >
              Sign out
            </button>
          </div>
        </Card>
      );
    }

    return (
      <Card className="p-8">
        <h2 className="text-xl font-semibold tracking-tight text-accent">Redirecting to sign in</h2>
        <p className="mt-4 text-sm leading-7 text-muted">
          {error ?? "This route requires an authenticated session."}
        </p>
      </Card>
    );
  }

  return children({ clearSession, retrySession, session, user });
}
