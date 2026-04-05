import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import { userProfileSchema } from "@/lib/profile-client";
import type {
  AuthenticatedUser,
  AuthSessionSeed,
  LoginPayload,
  RegisterPayload,
  RequestResult
} from "@/types/auth";

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().default("bearer"),
  expires_in: z.number().int().positive()
});

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  status: z.string().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  profile: userProfileSchema.nullable()
});

function mapTokenResponse(data: unknown): RequestResult<AuthSessionSeed> {
  const parsed = tokenResponseSchema.safeParse(data);

  if (!parsed.success) {
    return {
      ok: false,
      errorMessage: "Authentication succeeded but returned an invalid response.",
      status: 500
    };
  }

  return {
    ok: true,
    data: {
      accessToken: parsed.data.access_token,
      expiresIn: parsed.data.expires_in
    },
    status: 200
  };
}

export async function loginWithPassword(
  payload: LoginPayload
): Promise<RequestResult<AuthSessionSeed>> {
  const response = await apiRequest({
    body: payload,
    method: "POST",
    path: "/auth/login"
  });

  if (!response.ok) {
    return {
      ok: false,
      errorMessage: response.errorMessage,
      status: response.status
    };
  }

  const result = mapTokenResponse(response.data);
  return result.ok ? { ...result, status: response.status } : result;
}

export async function registerUser(
  payload: RegisterPayload
): Promise<RequestResult<AuthSessionSeed>> {
  const registerResponse = await apiRequest({
    body: {
      email: payload.email,
      password: payload.password,
      profile:
        payload.firstName || payload.lastName
          ? {
              first_name: payload.firstName,
              last_name: payload.lastName
            }
          : undefined
    },
    method: "POST",
    path: "/auth/register"
  });

  if (!registerResponse.ok) {
    return {
      ok: false,
      errorMessage: registerResponse.errorMessage,
      status: registerResponse.status
    };
  }

  return loginWithPassword({
    email: payload.email,
    password: payload.password
  });
}

export async function getAuthenticatedUser(
  accessToken: string
): Promise<RequestResult<AuthenticatedUser>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "GET",
    path: "/auth/me",
    retries: 0,
    timeoutMs: 5000
  });

  if (!response.ok) {
    return {
      ok: false,
      errorMessage: response.errorMessage,
      status: response.status
    };
  }

  const parsed = authenticatedUserSchema.safeParse(response.data);
  if (!parsed.success) {
    return {
      ok: false,
      errorMessage: "Authenticated user response was invalid.",
      status: 500
    };
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}
