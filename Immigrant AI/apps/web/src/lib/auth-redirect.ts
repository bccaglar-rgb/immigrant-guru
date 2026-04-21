const DEFAULT_AUTH_REDIRECT_PATH = "/dashboard";
const AUTH_FORM_PATHS = new Set(["/sign-in", "/sign-up"]);

export function resolveSafeAuthRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT_PATH
): string {
  if (!value) {
    return fallback;
  }

  // URL-decode first to defeat encoding tricks like %2F%2Fevil.com
  let decoded: string;
  try {
    decoded = decodeURIComponent(value.trim());
  } catch {
    return fallback;
  }

  // Must start with exactly one slash, not be protocol-relative (//)
  if (!decoded.startsWith("/") || decoded.startsWith("//")) {
    return fallback;
  }

  // Reject backslash-based bypasses (e.g. \evil.com)
  if (decoded.includes("\\")) {
    return fallback;
  }

  // Use the URL API to normalise and confirm the resolved path is same-origin
  try {
    const base = "https://app.invalid";
    const url = new URL(decoded, base);
    if (url.origin !== base) {
      return fallback;
    }
    if (AUTH_FORM_PATHS.has(url.pathname)) {
      return fallback;
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
