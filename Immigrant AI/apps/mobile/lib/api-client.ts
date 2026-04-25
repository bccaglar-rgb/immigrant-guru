/**
 * Thin fetch wrapper around the Immigrant Guru backend.
 *
 * Adds Bearer auth, JSON serialisation, timeout, error envelope parsing.
 * Backend: FastAPI under https://immigrant.guru/api/v1
 */
import Constants from "expo-constants";

import { getSecure, TOKEN_KEY } from "./secure-storage";

const API_URL: string =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.API_URL ??
  "https://immigrant.guru/api/v1";

const DEFAULT_TIMEOUT = 15_000;

export type ApiError = {
  ok: false;
  status: number;
  message: string;
  detail?: unknown;
};

export type ApiResult<T> = { ok: true; data: T } | ApiError;

async function authHeader(): Promise<Record<string, string>> {
  const token = await getSecure(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }
  const message =
    (body && typeof body === "object" && "detail" in body && typeof body.detail === "string"
      ? body.detail
      : null) ??
    res.statusText ??
    "Request failed.";
  return { ok: false, status: res.status, message, detail: body };
}

async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<ApiResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT, headers, ...rest } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(await authHeader()),
        ...(headers ?? {})
      }
    });
    if (!res.ok) return await parseError(res);
    if (res.status === 204) return { ok: true, data: undefined as T };
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Request timed out."
          : err.message
        : "Network error.";
    return { ok: false, status: 0, message };
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined })
};

export { API_URL };
