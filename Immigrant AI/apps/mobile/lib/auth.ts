/**
 * Auth client — mirrors apps/web/src/lib/auth-client.ts but for mobile.
 *
 * Endpoints (see apps/api/app/domains/auth/router.py):
 *   POST /auth/register             → RegistrationInitiatedResponse
 *   POST /auth/login                → TokenResponse (legacy email + password)
 *   POST /auth/verify-email         → TokenResponse (registration verify)
 *   POST /auth/email/code/request   → { sent: true }
 *   POST /auth/email/code/verify    → TokenResponse (passwordless login/signup)
 *   POST /auth/google               → TokenResponse (Google ID token)
 *   POST /auth/apple                → TokenResponse (Apple identityToken)
 *   POST /auth/logout               → 204
 *   GET  /auth/me                   → AuthenticatedUserResponse
 */
import { create } from "zustand";

import { api } from "./api-client";
import { deregisterPushToken, registerForPushNotifications } from "./notifications";
import {
  deleteSecure,
  getSecure,
  PUSH_TOKEN_KEY,
  setSecure,
  TOKEN_KEY,
  USER_KEY
} from "./secure-storage";

export type AuthUser = {
  id: string;
  email: string;
  plan: string;
  status: string;
};

// Backend returns snake_case; we parse both for safety.
type TokenResponseRaw = {
  access_token?: string;
  expires_in?: number;
  accessToken?: string;
  expiresIn?: number;
};

function parseToken(raw: TokenResponseRaw): { token: string; expiresIn: number } | null {
  const token = raw.access_token ?? raw.accessToken ?? "";
  const expiresIn = raw.expires_in ?? raw.expiresIn ?? 0;
  if (!token) return null;
  return { token, expiresIn };
}

export type AuthStatus = "loading" | "authenticated" | "guest";

type AuthResult = { ok: true } | { ok: false; error: string };
type SignInResult = AuthResult | { ok: false; error: string; needsVerify?: boolean };

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  hydrate: () => Promise<void>;
  signUp: (email: string, password: string, firstName?: string, lastName?: string) =>
    Promise<AuthResult>;
  verifyEmail: (email: string, code: string) => Promise<AuthResult>;
  resendCode: (email: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  // Passwordless email-code flow
  requestEmailCode: (email: string) => Promise<AuthResult>;
  verifyEmailCode: (email: string, code: string) => Promise<AuthResult>;
  // OAuth
  signInWithGoogle: (idToken: string) => Promise<AuthResult>;
  signInWithApple: (
    idToken: string,
    firstName?: string | null,
    lastName?: string | null,
  ) => Promise<AuthResult>;
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
      void registerForPushNotifications().catch(() => undefined);
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
    const res = await api.post<TokenResponseRaw>("/auth/verify-email", { email, code });
    if (!res.ok) return { ok: false, error: res.message };
    const parsed = parseToken(res.data);
    if (!parsed) return { ok: false, error: "Invalid server response." };
    await persistSession(parsed.token, null);
    const user = await fetchMe();
    if (user) await setSecure(USER_KEY, JSON.stringify(user));
    set({ status: "authenticated", user });
    void registerForPushNotifications().catch(() => undefined);
    return { ok: true };
  },

  async resendCode(email) {
    const res = await api.post("/auth/send-verification", { email });
    return res.ok ? { ok: true } : { ok: false, error: res.message };
  },

  async signIn(email, password) {
    const res = await api.post<TokenResponseRaw>("/auth/login", { email, password });
    if (!res.ok) {
      return { ok: false, error: res.message, needsVerify: res.status === 403 };
    }
    const parsed = parseToken(res.data);
    if (!parsed) return { ok: false, error: "Invalid server response." };
    await persistSession(parsed.token, null);
    const user = await fetchMe();
    if (user) await setSecure(USER_KEY, JSON.stringify(user));
    set({ status: "authenticated", user });
    void registerForPushNotifications().catch(() => undefined);
    return { ok: true };
  },

  async requestEmailCode(email) {
    const res = await api.post("/auth/email/code/request", { email: email.trim().toLowerCase() });
    return res.ok ? { ok: true } : { ok: false, error: res.message };
  },

  async verifyEmailCode(email, code) {
    const res = await api.post<TokenResponseRaw>("/auth/email/code/verify", {
      email: email.trim().toLowerCase(),
      code: code.trim(),
    });
    if (!res.ok) return { ok: false, error: res.message };
    const parsed = parseToken(res.data);
    if (!parsed) return { ok: false, error: "Invalid server response." };
    await persistSession(parsed.token, null);
    const user = await fetchMe();
    if (user) await setSecure(USER_KEY, JSON.stringify(user));
    set({ status: "authenticated", user });
    void registerForPushNotifications().catch(() => undefined);
    return { ok: true };
  },

  async signInWithGoogle(idToken) {
    const res = await api.post<TokenResponseRaw>("/auth/google", { id_token: idToken });
    if (!res.ok) return { ok: false, error: res.message };
    const parsed = parseToken(res.data);
    if (!parsed) return { ok: false, error: "Invalid server response." };
    await persistSession(parsed.token, null);
    const user = await fetchMe();
    if (user) await setSecure(USER_KEY, JSON.stringify(user));
    set({ status: "authenticated", user });
    void registerForPushNotifications().catch(() => undefined);
    return { ok: true };
  },

  async signInWithApple(idToken, firstName, lastName) {
    const res = await api.post<TokenResponseRaw>("/auth/apple", {
      id_token: idToken,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
    });
    if (!res.ok) return { ok: false, error: res.message };
    const parsed = parseToken(res.data);
    if (!parsed) return { ok: false, error: "Invalid server response." };
    await persistSession(parsed.token, null);
    const user = await fetchMe();
    if (user) await setSecure(USER_KEY, JSON.stringify(user));
    set({ status: "authenticated", user });
    void registerForPushNotifications().catch(() => undefined);
    return { ok: true };
  },

  async signOut() {
    const pushToken = await getSecure(PUSH_TOKEN_KEY);
    if (pushToken) {
      await deregisterPushToken(pushToken).catch(() => undefined);
    }
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
