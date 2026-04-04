const DEFAULT_AUTH_REDIRECT_PATH = "/dashboard";
const AUTH_FORM_PATHS = new Set(["/sign-in", "/sign-up"]);

export function resolveSafeAuthRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT_PATH
): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  const [pathname] = trimmed.split(/[?#]/, 1);
  if (AUTH_FORM_PATHS.has(pathname)) {
    return fallback;
  }

  return trimmed;
}
