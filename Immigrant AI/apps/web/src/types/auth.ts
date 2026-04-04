import type { UserProfile } from "@/types/profile";

export type AuthMode = "sign-in" | "sign-up";

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = LoginPayload & {
  firstName?: string;
  lastName?: string;
};

export type AuthSessionSeed = {
  accessToken: string;
  expiresIn: number;
};

export type AuthSession = AuthSessionSeed & {
  issuedAt: number;
};

export type AuthenticatedUserProfile = UserProfile;

export type AuthenticatedUser = {
  id: string;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
  profile: AuthenticatedUserProfile | null;
};

export type RequestResult<T> =
  | {
      ok: true;
      data: T;
      status?: number;
    }
  | {
      ok: false;
      errorMessage: string;
      status?: number;
    };
