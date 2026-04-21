"use client";

import { useContext } from "react";

import { AuthSessionContext } from "@/components/auth/auth-provider";

// Safe no-op defaults used when useAuthSession is called outside AuthProvider
// (e.g. during Next.js /_not-found SSR prerender where the provider tree is
// not mounted). Components render their unauthenticated/loading state — the
// real provider mounts on the client and takes over immediately after hydration.
const noop = () => Promise.resolve({ ok: false as const, errorMessage: "no-provider" });
const AUTH_DEFAULTS: import("@/components/auth/auth-provider").AuthSessionContextValue = {
  clearSession: () => {},
  error: null,
  establishSession: noop,
  refreshCurrentUser: noop,
  replaceUserProfile: () => {},
  retrySession: noop,
  session: null,
  status: "loading",
  user: null,
};

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  return context ?? AUTH_DEFAULTS;
}
