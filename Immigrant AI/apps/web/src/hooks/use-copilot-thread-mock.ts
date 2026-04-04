"use client";

import { useEffect, useRef, useState } from "react";

import { buildMockAssistantMessage } from "@/lib/copilot-mocks";
import type {
  CaseWorkspaceCopilot,
  CaseWorkspaceCopilotMessage
} from "@/types/case-workspace";

type UseCopilotThreadMockResult = {
  draft: string;
  isSending: boolean;
  messages: CaseWorkspaceCopilotMessage[];
  selectedPrompt: string | null;
  sendDraft: () => void;
  setDraft: (value: string) => void;
  useSuggestedPrompt: (prompt: string) => void;
};

export function useCopilotThreadMock(
  copilot: CaseWorkspaceCopilot
): UseCopilotThreadMockResult {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<CaseWorkspaceCopilotMessage[]>(
    copilot.messages
  );
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setMessages(copilot.messages);
    setDraft("");
    setIsSending(false);
    setSelectedPrompt(null);
  }, [copilot]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function useSuggestedPrompt(prompt: string) {
    setDraft(prompt);
    setSelectedPrompt(prompt);
  }

  function sendDraft() {
    const trimmedDraft = draft.trim();

    if (!trimmedDraft || isSending) {
      return;
    }

    const userMessage: CaseWorkspaceCopilotMessage = {
      content: trimmedDraft,
      id: `user-${Date.now()}`,
      role: "user",
      timestamp: new Date().toISOString()
    };

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setDraft("");
    setSelectedPrompt(null);
    setIsSending(true);

    timeoutRef.current = window.setTimeout(() => {
      setMessages((currentMessages) => [
        ...currentMessages,
        buildMockAssistantMessage(trimmedDraft)
      ]);
      setIsSending(false);
      timeoutRef.current = null;
    }, 900);
  }

  return {
    draft,
    isSending,
    messages,
    selectedPrompt,
    sendDraft,
    setDraft,
    useSuggestedPrompt
  };
}
