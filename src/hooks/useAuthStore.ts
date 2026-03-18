import { create } from "zustand";
import { type AuthUser, getAuthToken, setAuthToken, clearAuthToken, me, login as apiLogin, signup as apiSignup } from "../services/authClient";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** Called once on app mount to check if token is valid */
  init: () => Promise<void>;
  login: (email: string, password: string, twoFactorCode?: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: () => boolean;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  init: async () => {
    const token = getAuthToken();
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const res = await me();
      set({ user: res.user, loading: false });
    } catch {
      clearAuthToken();
      set({ user: null, loading: false });
    }
  },

  login: async (email, password, twoFactorCode?) => {
    const res = await apiLogin(email, password, twoFactorCode);
    setAuthToken(res.token);
    set({ user: res.user });
  },

  signup: async (email, password) => {
    await apiSignup(email, password);
    // Auto-login after signup
    const res = await apiLogin(email, password);
    setAuthToken(res.token);
    set({ user: res.user });
  },

  logout: () => {
    clearAuthToken();
    set({ user: null });
  },

  isAdmin: () => get().user?.role === "ADMIN",
  isAuthenticated: () => get().user !== null,
}));
