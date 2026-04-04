import type { AuthSession, AuthSessionSeed } from "@/types/auth";

const AUTH_SESSION_KEY = "immigrant-ai.auth.session";
const AUTH_CHANGE_EVENT = "immigrant-ai:auth-changed";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function isSessionExpired(session: AuthSession): boolean {
  return session.issuedAt + session.expiresIn * 1000 <= Date.now();
}

function dispatchAuthChange(): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
}

export function getAuthChangeEventName(): string {
  return AUTH_CHANGE_EVENT;
}

export function readAuthSession(): AuthSession | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as AuthSession;
    if (
      typeof parsed?.accessToken !== "string" ||
      typeof parsed?.expiresIn !== "number" ||
      typeof parsed?.issuedAt !== "number"
    ) {
      window.sessionStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }

    if (isSessionExpired(parsed)) {
      window.sessionStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeAuthSession(session: AuthSessionSeed): boolean {
  if (!isBrowser()) {
    return false;
  }

  const payload: AuthSession = {
    ...session,
    issuedAt: Date.now()
  };

  try {
    window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(payload));
    dispatchAuthChange();
    return true;
  } catch {
    return false;
  }
}

export function clearAuthSession(): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  } catch {}

  dispatchAuthChange();
}
