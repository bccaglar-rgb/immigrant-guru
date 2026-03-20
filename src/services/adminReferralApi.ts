import { getAuthToken } from "./authClient";

export interface AdminUserLiteDto {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: string;
}

export interface ReferralCodeDto {
  id: string;
  code: string;
  assignedUserId?: string;
  assignedEmail?: string;
  createdByUserId: string;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt?: string;
  grantPlanTier?: string;
  grantDurationDays?: number;
  createdAt: string;
  updatedAt: string;
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

export const fetchAdminUsersLite = () =>
  req<{ ok: true; users: AdminUserLiteDto[] }>("/api/admin/users-lite");

export const createAdminUser = (input: { email: string; password: string; role?: "ADMIN" | "USER" }) =>
  req<{ ok: true; user: AdminUserLiteDto }>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const fetchReferralCodes = () =>
  req<{ ok: true; items: ReferralCodeDto[] }>("/api/admin/referral-codes");

export const createReferralCode = (input: {
  assignedUserId?: string;
  assignedEmail?: string;
  prefix?: string;
  maxUses?: number;
  expiresDays?: number;
  grantPlanTier?: string;
  grantDurationDays?: number;
}) =>
  req<{ ok: true; item: ReferralCodeDto }>("/api/admin/referral-codes", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const setReferralCodeActive = (id: string, active: boolean) =>
  req<{ ok: true; item: ReferralCodeDto }>(`/api/admin/referral-codes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });

export const deleteReferralCode = (id: string) =>
  req<{ ok: true }>(`/api/admin/referral-codes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
