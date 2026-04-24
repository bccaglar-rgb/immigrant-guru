/**
 * RevenueCat integration.
 *
 * iOS / Android:  uses Apple IAP + Google Play Billing (the only way to sell
 *                 digital subscriptions per Apple/Google policy).
 * Web preview:    no-op — web uses Stripe directly (see apps/web billing).
 *
 * Offerings correspond to backend plans:
 *   starter_monthly  → user.plan = "starter"
 *   plus_monthly     → user.plan = "plus"
 *   premium_monthly  → user.plan = "premium"
 *
 * When a user purchases, RevenueCat fires a webhook to
 * `POST /api/v1/billing/revenuecat/webhook` which upgrades the user's plan
 * in our DB.  The app also calls `refreshUser()` on PURCHASE_COMPLETED so
 * the UI updates immediately.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  LOG_LEVEL
} from "react-native-purchases";

type Extra = { REVENUECAT_IOS_KEY?: string; REVENUECAT_ANDROID_KEY?: string };

function apiKey(): string | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
  if (Platform.OS === "ios") return extra.REVENUECAT_IOS_KEY ?? null;
  if (Platform.OS === "android") return extra.REVENUECAT_ANDROID_KEY ?? null;
  return null;
}

let initialized = false;

export async function configureRevenueCat(appUserId?: string): Promise<void> {
  if (Platform.OS === "web") return;
  if (initialized) {
    if (appUserId) await Purchases.logIn(appUserId).catch(() => undefined);
    return;
  }
  const key = apiKey();
  if (!key) {
    console.warn("[revenuecat] no API key configured — skipping init");
    return;
  }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: key, appUserID: appUserId ?? null });
  initialized = true;
}

export async function identifyUser(userId: string): Promise<void> {
  if (Platform.OS === "web" || !initialized) return;
  await Purchases.logIn(userId).catch(() => undefined);
}

export async function signOutRevenueCat(): Promise<void> {
  if (Platform.OS === "web" || !initialized) return;
  await Purchases.logOut().catch(() => undefined);
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (Platform.OS === "web" || !initialized) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ ok: true; info: CustomerInfo } | { ok: false; cancelled: boolean; error: string }> {
  if (Platform.OS === "web" || !initialized) {
    return { ok: false, cancelled: false, error: "Purchases not available on this platform." };
  }
  try {
    const result = await Purchases.purchasePackage(pkg);
    return { ok: true, info: result.customerInfo };
  } catch (err: unknown) {
    const e = err as { userCancelled?: boolean; message?: string };
    return {
      ok: false,
      cancelled: Boolean(e.userCancelled),
      error: e.message ?? "Purchase failed."
    };
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (Platform.OS === "web" || !initialized) return null;
  try {
    return await Purchases.restorePurchases();
  } catch {
    return null;
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (Platform.OS === "web" || !initialized) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/** Map a RevenueCat entitlement identifier to our internal plan key. */
export function planFromCustomerInfo(info: CustomerInfo | null): string {
  if (!info) return "free";
  const entitlements = info.entitlements.active;
  if (entitlements["premium"]) return "premium";
  if (entitlements["plus"]) return "plus";
  if (entitlements["starter"]) return "starter";
  return "free";
}
