import { getPublicEnv } from "@/lib/config";
import { fetchJson } from "@/lib/http";

type ApiRequestOptions = {
  authToken?: string;
  body?: BodyInit | Record<string, unknown> | null;
  cache?: RequestCache;
  headers?: HeadersInit;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  next?: {
    revalidate?: number;
    tags?: string[];
  };
  path: string;
  retries?: number;
  timeoutMs?: number;
};

export type ApiResult =
  | {
      ok: true;
      data: unknown;
      status: number;
    }
  | {
      ok: false;
      errorMessage: string;
      status: number;
    };

function buildApiUrl(path: string): string {
  const { apiUrl } = getPublicEnv();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiUrl}/api/v1${normalizedPath}`;
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isBinaryBody(value: unknown): value is Exclude<BodyInit, ReadableStream> {
  return (
    typeof value === "string" ||
    value instanceof URLSearchParams ||
    value instanceof Blob ||
    value instanceof ArrayBuffer
  );
}

export async function apiRequest({
  authToken,
  body,
  cache,
  headers,
  method = "GET",
  next,
  path,
  retries = 0,
  timeoutMs = 5000
}: ApiRequestOptions): Promise<ApiResult> {
  const mergedHeaders = new Headers(headers);
  const isMultipartBody = isFormData(body);
  const isRawBody =
    body !== undefined && body !== null && !isMultipartBody && isBinaryBody(body);
  const requestBody =
    body === undefined || body === null
      ? undefined
      : isMultipartBody || isRawBody
        ? body
        : JSON.stringify(body);

  if (
    body !== undefined &&
    body !== null &&
    !isMultipartBody &&
    !isRawBody &&
    !mergedHeaders.has("Content-Type")
  ) {
    mergedHeaders.set("Content-Type", "application/json");
  }

  if (authToken) {
    mergedHeaders.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetchJson(buildApiUrl(path), {
    body: requestBody,
    cache,
    headers: mergedHeaders,
    method,
    next,
    retries,
    timeoutMs
  });

  if (!response.ok) {
    return {
      ok: false,
      errorMessage: response.errorMessage,
      status: response.status
    };
  }

  return {
    ok: true,
    data: response.data,
    status: response.status
  };
}
