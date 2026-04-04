import { z } from "zod";

import { getPublicEnv } from "@/lib/config";
import { fetchJson } from "@/lib/http";
import type { SystemHealthViewModel } from "@/types/system-health";

const apiHealthSchema = z
  .object({
    service: z.string().trim().min(1).catch("Immigrant Guru API"),
    status: z.string().trim().min(1).catch("unknown")
  })
  .passthrough();

function toCheckedAtLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export async function getApiHealthStatus(): Promise<SystemHealthViewModel> {
  const { apiUrl } = getPublicEnv();
  const checkedAt = new Date();
  const healthUrl = `${apiUrl.replace(/\/$/, "")}/api/v1/health`;

  const response = await fetchJson(healthUrl, {
    cache: "no-store",
    next: { revalidate: 0 },
    retries: 2,
    retryDelayMs: 250,
    timeoutMs: 3500
  });

  if (!response.ok) {
    return {
      serviceName: "API Unavailable",
      statusLabel: "degraded",
      message:
        "The platform loaded, but the core API did not return a healthy response in time.",
      checkedAtLabel: toCheckedAtLabel(checkedAt),
      detailLabel: response.errorMessage
    };
  }

  const parsed = apiHealthSchema.safeParse(response.data);
  if (!parsed.success) {
    return {
      serviceName: "API Response Invalid",
      statusLabel: "degraded",
      message:
        "The platform responded, but the health payload did not match the expected contract.",
      checkedAtLabel: toCheckedAtLabel(checkedAt),
      detailLabel: "Health response could not be parsed safely."
    };
  }

  const statusLabel = parsed.data.status.toLowerCase() === "ok" ? "ok" : "degraded";

  return {
    serviceName: parsed.data.service,
    statusLabel,
    message:
      statusLabel === "ok"
        ? "Core platform services are responding and the health contract is intact."
        : "The platform responded, but reported a degraded or unexpected status.",
    checkedAtLabel: toCheckedAtLabel(checkedAt),
    detailLabel:
      statusLabel === "ok"
        ? "Health checks are requested with timeout and retry safeguards."
        : `Reported backend status: ${parsed.data.status}`
  };
}
