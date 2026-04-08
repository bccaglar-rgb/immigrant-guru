export type CopilotMessageRole = "user" | "assistant" | "system";

export type CopilotThreadMessage = {
  id: string;
  thread_id: string;
  case_id: string;
  user_id: string;
  role: CopilotMessageRole;
  content: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export type CopilotThread = {
  id: string;
  case_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  messages: CopilotThreadMessage[];
};

export type CopilotMessageExchange = {
  thread: CopilotThread;
  user_message: CopilotThreadMessage;
  assistant_message: CopilotThreadMessage;
};

export type CopilotMessageCreatePayload = {
  content: string;
};
