const TOKEN_KEY = "bitrium.auth.token";
const LEGACY_TOKEN_KEY = "bitrium_token";

export interface AuthUser {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  twoFactorEnabled: boolean;
  hasActivePlan: boolean;
}

export const getAuthToken = () => window.localStorage.getItem(TOKEN_KEY) ?? window.localStorage.getItem(LEGACY_TOKEN_KEY) ?? "";
export const setAuthToken = (token: string) => {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
};
export const clearAuthToken = () => {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
};

const req = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? body.message ?? "request_failed");
  }
  return body as T;
};

export const signup = (email: string, password: string) =>
  req<{ ok: true; user: { id: string; email: string } }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const login = (email: string, password: string, twoFactorCode?: string) =>
  req<{ ok: true; token: string; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, twoFactorCode }),
  });

export const me = () => req<{ ok: true; user: AuthUser }>("/api/auth/me");

export const requestPasswordReset = (email: string) =>
  req<{ ok: true; devResetToken?: string }>("/api/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const confirmPasswordReset = (token: string, newPassword: string) =>
  req<{ ok: true }>("/api/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });

// ── 2FA Setup ──
export const setup2FA = () =>
  req<{ ok: true; secret: string; otpauthUrl: string }>("/api/auth/2fa/setup", {
    method: "POST",
  });

export const enable2FA = (token: string) =>
  req<{ ok: true }>("/api/auth/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
