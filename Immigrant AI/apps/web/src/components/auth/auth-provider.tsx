"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import type { ReactNode } from "react";

import { getAuthenticatedUser } from "@/lib/auth-client";
import {
  clearAuthSession,
  getAuthChangeEventName,
  readAuthSession,
  writeAuthSession
} from "@/lib/auth-storage";
import type {
  AuthSession,
  AuthSessionSeed,
  AuthenticatedUser,
  RequestResult
} from "@/types/auth";
import type { UserProfile } from "@/types/profile";

type AuthSessionStatus = "loading" | "authenticated" | "unauthenticated";
type ResolvedAuthSessionStatus =
  | AuthSessionStatus
  | "error";

export type AuthSessionContextValue = {
  clearSession: () => void;
  error: string | null;
  establishSession: (
    nextSession: AuthSessionSeed
  ) => Promise<RequestResult<AuthenticatedUser>>;
  refreshCurrentUser: (
    providedSession?: AuthSession | null
  ) => Promise<RequestResult<AuthenticatedUser>>;
  replaceUserProfile: (profile: UserProfile) => void;
  retrySession: () => Promise<RequestResult<AuthenticatedUser>>;
  session: AuthSession | null;
  status: ResolvedAuthSessionStatus;
  user: AuthenticatedUser | null;
};

export const AuthSessionContext = createContext<AuthSessionContextValue | null>(
  null
);

type AuthProviderProps = Readonly<{
  children: ReactNode;
}>;

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<ResolvedAuthSessionStatus>("loading");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetSessionState = useCallback(() => {
    setSession(null);
    setUser(null);
    setError(null);
    setStatus("unauthenticated");
  }, []);

  const clearSession = useCallback(() => {
    clearAuthSession();
    resetSessionState();
  }, [resetSessionState]);

  const replaceUserProfile = useCallback((profile: UserProfile) => {
    setUser((current) => (current ? { ...current, profile } : current));
  }, []);

  const refreshCurrentUser = useCallback(
    async (providedSession?: AuthSession | null): Promise<RequestResult<AuthenticatedUser>> => {
      const activeSession = providedSession ?? readAuthSession();
      if (!activeSession) {
        resetSessionState();
        return {
          ok: false,
          errorMessage: "You are not authenticated."
        };
      }

      setSession(activeSession);
      setStatus("loading");

      const result = await getAuthenticatedUser(activeSession.accessToken);
      if (!result.ok) {
        if (result.status === 401 || result.status === 403) {
          clearAuthSession();
          resetSessionState();
          setError(result.errorMessage);
          return result;
        }

        setSession(activeSession);
        setUser(null);
        setError(
          "Your session could not be verified right now. Retry in a moment."
        );
        setStatus("error");
        return result;
      }

      setUser(result.data);
      setError(null);
      setStatus("authenticated");
      return result;
    },
    [resetSessionState]
  );

  const syncFromStorage = useCallback(async () => {
    const stored = readAuthSession();
    if (!stored) {
      resetSessionState();
      return;
    }

    setSession(stored);
    await refreshCurrentUser(stored);
  }, [refreshCurrentUser, resetSessionState]);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      void syncFromStorage();
    }, 0);

    const handleAuthChange = () => {
      void syncFromStorage();
    };

    window.addEventListener(getAuthChangeEventName(), handleAuthChange);
    return () => {
      window.clearTimeout(syncTimer);
      window.removeEventListener(getAuthChangeEventName(), handleAuthChange);
    };
  }, [syncFromStorage]);

  const establishSession = useCallback(
    async (nextSession: AuthSessionSeed): Promise<RequestResult<AuthenticatedUser>> => {
      const saved = writeAuthSession(nextSession);

      if (!saved) {
        setSession(null);
        setUser(null);
        setStatus("unauthenticated");
        setError(
          "Authentication succeeded, but this browser session could not be stored safely."
        );
        return {
          ok: false,
          errorMessage:
            "Authentication succeeded, but this browser session could not be stored safely."
        };
      }

      const stored = readAuthSession();
      return refreshCurrentUser(stored);
    },
    [refreshCurrentUser]
  );

  const retrySession = useCallback(() => {
    return refreshCurrentUser(session ?? readAuthSession());
  }, [refreshCurrentUser, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const remainingMs =
      session.issuedAt + session.expiresIn * 1000 - Date.now();

    if (remainingMs <= 0) {
      const expireNowTimer = window.setTimeout(() => {
        clearSession();
      }, 0);

      return () => {
        window.clearTimeout(expireNowTimer);
      };
      return;
    }

    const timer = window.setTimeout(() => {
      clearSession();
    }, remainingMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearSession, session]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      clearSession,
      error,
      establishSession,
      refreshCurrentUser,
      replaceUserProfile,
      retrySession,
      session,
      status,
      user
    }),
    [
      clearSession,
      error,
      establishSession,
      refreshCurrentUser,
      replaceUserProfile,
      retrySession,
      session,
      status,
      user
    ]
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}
