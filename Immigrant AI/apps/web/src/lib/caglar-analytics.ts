/**
 * CaglarAnalytics — thin typed wrapper around window.CaglarAnalytics.
 *
 * All calls are no-ops when the SDK hasn't loaded yet (e.g. SSR, blocked by
 * an ad-blocker, or the script hasn't initialised).  Never throws.
 */

type Properties = Record<string, unknown>;

function sdk(): { track?: (e: string, p?: Properties) => void; identify?: (id: string, traits?: Properties) => void } | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { CaglarAnalytics?: object }).CaglarAnalytics as ReturnType<typeof sdk>;
}

/** Fire a named analytics event. */
export function caTrack(event: string, properties?: Properties): void {
  try {
    sdk()?.track?.(event, properties);
  } catch {
    // fail silently
  }
}

/** Associate the current browser session with a known user. */
export function caIdentify(userId: string, traits?: Properties): void {
  try {
    sdk()?.identify?.(userId, traits);
  } catch {
    // fail silently
  }
}

// ── Convenience helpers ────────────────────────────────────────────────────────

export const caSignupCompleted = (userId?: string, traits?: Properties) => {
  if (userId) caIdentify(userId, traits);
  caTrack("signup_completed", { userId, ...traits });
};

export const caLogin = (userId?: string, traits?: Properties) => {
  if (userId) caIdentify(userId, traits);
  caTrack("login", { userId, ...traits });
};

export const caLogout = () => caTrack("logout");

export const caPaymentSuccess = (plan: string, amount?: number) =>
  caTrack("payment_success", { plan, amount });

export const caPaymentFailed = (plan?: string, reason?: string) =>
  caTrack("payment_failed", { plan, reason });
