import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";

export type Plan = {
  name: string;
  price: number;
  countries: number;
  features: string[];
  popular?: boolean;
};

export type PlansResponse = {
  plans: Record<string, Plan>;
};

export type BillingStatus = {
  plan: string;
  plan_name: string;
  price: number;
  features: string[];
  is_premium: boolean;
};

export type CheckoutResult = {
  success: boolean;
  plan: string;
  plan_name: string;
  price: number;
  message: string;
};

export async function getPlans(): Promise<ApiRequestResult<PlansResponse>> {
  const response = await apiRequest({ method: "GET", path: "/billing/plans", retries: 0, timeoutMs: 5000 });
  if (!response.ok) return { ok: false, errorMessage: response.errorMessage, status: response.status };
  return { ok: true, data: response.data as PlansResponse, status: response.status };
}

export async function getBillingStatus(accessToken: string): Promise<ApiRequestResult<BillingStatus>> {
  const response = await apiRequest({ authToken: accessToken, method: "GET", path: "/billing/status", retries: 0, timeoutMs: 5000 });
  if (!response.ok) return { ok: false, errorMessage: response.errorMessage, status: response.status };
  return { ok: true, data: response.data as BillingStatus, status: response.status };
}

export async function checkout(accessToken: string, plan: string): Promise<ApiRequestResult<CheckoutResult>> {
  const response = await apiRequest({ authToken: accessToken, method: "POST", path: "/billing/checkout", body: { plan }, retries: 0, timeoutMs: 10000 });
  if (!response.ok) return { ok: false, errorMessage: response.errorMessage, status: response.status };
  return { ok: true, data: response.data as CheckoutResult, status: response.status };
}
