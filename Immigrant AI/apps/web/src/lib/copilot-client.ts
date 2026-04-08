import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import type {
  CopilotMessageCreatePayload,
  CopilotMessageExchange,
  CopilotThread
} from "@/types/copilot";

const copilotMessageSchema = z.object({
  id: z.string().uuid(),
  thread_id: z.string().uuid(),
  case_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
  metadata_json: z.record(z.unknown()).default({}),
  created_at: z.string().datetime()
});

const copilotThreadSchema = z.object({
  id: z.string().uuid(),
  case_id: z.string().uuid(),
  user_id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  messages: z.array(copilotMessageSchema)
});

const copilotMessageExchangeSchema = z.object({
  thread: copilotThreadSchema,
  user_message: copilotMessageSchema,
  assistant_message: copilotMessageSchema
});

function invalidPayloadResult(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

export async function getCaseCopilotThread(
  accessToken: string,
  caseId: string
): Promise<ApiRequestResult<CopilotThread>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "GET",
    path: `/cases/${caseId}/copilot/thread`,
    retries: 0,
    timeoutMs: 10000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = copilotThreadSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Copilot thread response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}

export async function createCaseCopilotMessage(
  accessToken: string,
  caseId: string,
  payload: CopilotMessageCreatePayload
): Promise<ApiRequestResult<CopilotMessageExchange>> {
  const response = await apiRequest({
    authToken: accessToken,
    body: payload,
    method: "POST",
    path: `/cases/${caseId}/copilot/messages`,
    retries: 0,
    timeoutMs: 30000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = copilotMessageExchangeSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Copilot message response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}
