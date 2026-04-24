/**
 * Auth client — mirrors apps/web/src/lib/auth-client.ts but for mobile.
 *
 * Endpoints (see apps/api/app/domains/auth/router.py):
 *   POST /auth/register  → RegistrationInitiatedResponse (no token — email verify first)
 *   POST /auth/login     → TokenResponse { accessToken, expiresIn }
 *   POST /auth/verify    → TokenResponse (after 6-digit code)
 *   POST /auth/resend    → 204
 *   POST /auth/logout    → 204
 *   GET  /auth/me        → AuthenticatedUserResponse
 */
import { create } from "zustand";

import { api } from "./api-client";
import { deleteSecure, getSecure, setSecure, TOKEN_KEY, USER_KEY } from "./secure-storage";

export type AuthUser = {
  id: string;
  email: string;
  plan: string;
  status: string;
};

type TokenResponse = { accessToken: string; expiresIn: number };

export type AuthStatus = "loading" | "authenticated" | "guest";

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  hydrate: () => Promise<void>;
  signUp: (email: string, password: string, firstName?: string, lastName?: string) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  verifyEmail: (email: string, code: string) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  resendCode: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signIn: (email: string, password: string) =>
    Promise<{ ok: true } | { ok: false; error: string; needsVerify?: boolean }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

async function persistSession(token: string, user: AuthUser | null): Promise<void> {
  await setSecure(TOKEN_KEY, token);
  if (user) await setSecure(USER_KEY, JSON.stringify(user));
}

async function loadStoredUser(): Promise<AuthUser | null> {
  const raw = await getSecure(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

async function fetchMe(): Promise<AuthUser | null> {
  const res = await api.get<AuthUser>("/auth/me");
  return res.ok ? res.data : null;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,

  async hydrate() {
    const token = await getSecure(TOKEN_KEY);
    if (!token) {
      set({ status: "guest", user: null });
      return;
    }
    const stored = await loadStoredUser();
    if (stored) set({ status: "authenticated", user: stored });
    const fresh = await fetchMe();
    if (fresh) {
      await setSecure(USER_KEY, JSON.stringify(fresh));
      set({ status: "authenticated", user: fresh });
    } else if (!stored) {
      // token is invalid and no cached user → force logout
      await deleteSecure(TOKEN_KEY);
      await deleteSecure(USER_KEY);
      set({ status: "guest", user: null });
    }
  },

  async signUp(email, password, firstName, lastName) {
    const res = await api.post<{ verificationRequired: boolean }>("/auth/register", {
      email,
      password,
      firstName,
      lastName
    });
    if (!res.ok) return { ok: false, error: res.message };
    return { ok: true };
  },

  async verifyEmail(email, code) {
    const res = await api.post<TokenResponse>("/auth/verify", { email, code });
    if (!res.ok) return { ok: false, error: res.message };
    await persistSession(res.data.accessToken, null);
    const user = await fetchMe();
    if (user) await setSecure(USER_KEY, JSON.stringify(user));
    set({ status: "authenticated", user });
    return { ok: true };
  },

  async resendCode(email) {
    const res = await api.post("/auth/resend", { email });
    return res.ok ? { ok: true } : { ok: false, error: res.message };
  },

  async signIn(email, password) {
    const res = await api.post<TokenResponse>("/auth/login", { email, password });
    if (!res.ok) {
      return { ok: false, error: res.message, needsVerify: res.status === 403 };
    }
    await persistSession(res.data.accessToken, null);
    const user = await fetchMe();
    if (user) await setSecure(USER_KEY, JSON.stringify(user));
    set({ status: "authenticated", user });
    return { ok: true };
  },

  async signOut() {
    await api.post("/auth/logout").catch(() => undefined);
    await deleteSecure(TOKEN_KEY);
    await deleteSecure(USER_KEY);
    set({ status: "guest", user: null });
  },

  async refreshUser() {
    const user = await fetchMe();
    if (user) {
      await setSecure(USER_KEY, JSON.stringify(user));
      set({ user });
    }
  }
}));
