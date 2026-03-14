import { getAuthToken } from "./authClient";

export interface PlanDto {
  id: string;
  name: string;
  priceUsdt: number;
  durationDays: number;
  features: string[];
  enabled: boolean;
}

export interface InvoiceDto {
  id: string;
  planId?: string;
  invoiceType?: "PLAN" | "TOKEN_CREATOR";
  title?: string;
  externalRef?: string;
  expectedAmountUsdt: number;
  paidAmountUsdt: number;
  depositAddress: string;
  status: "created" | "awaiting_payment" | "partially_paid" | "paid" | "expired" | "failed";
  expiresAt: string;
  paidAt?: string;
  paymentTxHash?: string;
}

export interface AdminMemberOverviewDto {
  userId: string;
  email: string;
  createdAt: string;
  membershipStatus: "ACTIVE" | "INACTIVE";
  activePlanName: string;
  endAt: string | null;
  daysRemaining: number;
  purchasedMonths: number;
  totalPaidUsdt: number;
  subscriptionsCount: number;
}

const req = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? body.message ?? "request_failed");
  return body as T;
};

export const fetchPlans = () => req<{ ok: true; plans: PlanDto[] }>("/api/payments/plans");

export const createInvoice = (planId: string) =>
  req<{ ok: true; invoice: InvoiceDto; qrPayload: string }>("/api/payments/invoices", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });

export const getInvoice = (invoiceId: string) => req<{ ok: true; invoice: InvoiceDto }>(`/api/payments/invoices/${encodeURIComponent(invoiceId)}`);

export const fetchMySubscriptions = () => req<{ ok: true; subscriptions: unknown[] }>("/api/payments/subscriptions/me");

export const fetchAdminPlans = () => req<{ ok: true; plans: PlanDto[] }>("/api/admin/plans");

export const upsertAdminPlan = (plan: Partial<PlanDto> & { name: string; priceUsdt: number; durationDays: number; features: string[]; enabled: boolean }) =>
  req<{ ok: true; plan: PlanDto }>("/api/admin/plans", {
    method: "POST",
    body: JSON.stringify(plan),
  });

export const deleteAdminPlan = (id: string) => req<{ ok: true }>(`/api/admin/plans/${encodeURIComponent(id)}`, { method: "DELETE" });

export const fetchAdminMembersOverview = () =>
  req<{
    ok: true;
    totals: { users: number; activeUsers: number; totalPaidUsdt: number; avgPaidUsdt: number };
    members: AdminMemberOverviewDto[];
  }>("/api/admin/members/overview");
