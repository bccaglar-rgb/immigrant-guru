"use client";

import type { ReactNode } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";

type OnboardingGuardProps = Readonly<{
  children: ReactNode;
}>;

export function OnboardingGuard({ children }: OnboardingGuardProps) {
  return (
    <ProtectedRoute redirectTo="/sign-in?next=%2Fonboarding">
      {() => children}
    </ProtectedRoute>
  );
}
