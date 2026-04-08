"use client";

import { useEffect, useMemo, useState } from "react";

import { CopilotComposer } from "@/components/dashboard/copilot-composer";
import { CopilotMessageList } from "@/components/dashboard/copilot-message-list";
import { CopilotSuggestedPrompts } from "@/components/dashboard/copilot-suggested-prompts";
import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Card } from "@/components/ui/card";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  createCaseCopilotMessage,
  getCaseCopilotThread
} from "@/lib/copilot-client";
import type { CopilotThreadMessage } from "@/types/copilot";
import type { CaseWorkspaceCopilotMessage } from "@/types/case-workspace";

type CopilotPanelProps = Readonly<{
  accessToken: string;
  caseId: string;
  suggestedPrompts?: string[];
  summary?: string;
}>;

const defaultPrompts = [
  "What should I focus on next for this case?",
  "Which missing document matters most right now?",
  "What weakens the current pathway the most?"
];

function mapMessage(
  message: CopilotThreadMessage
): CaseWorkspaceCopilotMessage | null {
  if (message.role === "system") {
    return null;
  }

  const suggestedActions = Array.isArray(message.metadata_json.suggested_actions)
    ? message.metadata_json.suggested_actions.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const relatedRisks = Array.isArray(message.metadata_json.related_risks)
    ? message.metadata_json.related_risks.filter(
        (value): value is string => typeof value === "string"
      )
    : [];

  return {
    content: message.content,
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    sourceAttributions: [
      ...(suggestedActions.length > 0
        ? [
            {
              id: `${message.id}-actions`,
              label: `${suggestedActions.length} suggested action${suggestedActions.length === 1 ? "" : "s"}`,
              type: "strategy" as const
            }
          ]
        : []),
      ...(relatedRisks.length > 0
        ? [
            {
              id: `${message.id}-risks`,
              label: `${relatedRisks.length} related risk${relatedRisks.length === 1 ? "" : "s"}`,
              type: "case" as const
            }
          ]
        : [])
    ],
    timestamp: message.created_at
  };
}

export function CopilotPanel({
  accessToken,
  caseId,
  suggestedPrompts = defaultPrompts,
  summary
}: CopilotPanelProps) {
  const { clearSession } = useAuthSession();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<CaseWorkspaceCopilotMessage[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadThread() {
      setIsLoading(true);
      setError(null);

      const result = await getCaseCopilotThread(accessToken, caseId);
      if (cancelled) {
        return;
      }

      setIsLoading(false);

      if (!result.ok) {
        if (result.status === 401) {
          clearSession();
          return;
        }

        setError(result.errorMessage);
        return;
      }

      setMessages(
        result.data.messages
          .map(mapMessage)
          .filter((message): message is CaseWorkspaceCopilotMessage => message !== null)
      );
    }

    void loadThread();

    return () => {
      cancelled = true;
    };
  }, [accessToken, caseId, clearSession]);

  async function sendDraft() {
    const content = draft.trim();
    if (content.length === 0) {
      return;
    }

    setIsSending(true);
    setError(null);

    const result = await createCaseCopilotMessage(accessToken, caseId, { content });
    setIsSending(false);

    if (!result.ok) {
      if (result.status === 401) {
        clearSession();
        return;
      }

      setError(result.errorMessage);
      return;
    }

    setMessages(
      result.data.thread.messages
        .map(mapMessage)
        .filter((message): message is CaseWorkspaceCopilotMessage => message !== null)
    );
    setDraft("");
    setSelectedPrompt(null);
  }

  function useSuggestedPrompt(prompt: string) {
    setDraft(prompt);
    setSelectedPrompt(prompt);
  }

  const panelSummary = useMemo(
    () =>
      summary ||
      "Ask focused, case-aware questions to turn current evidence, risk signals, and next actions into a practical execution sequence.",
    [summary]
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
      <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)] md:p-7">
        <div className="flex flex-col gap-4 border-b border-line/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
              Immigration copilot
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              Case advisory conversation
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
              {panelSummary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DashboardStatusPill label="Action-oriented" tone="accent" />
            <DashboardStatusPill label="Case context" tone="neutral" />
          </div>
        </div>

        <div className="mt-6">
          {error ? (
            <div className="mb-5 rounded-xl border border-red/20 bg-red/5 px-4 py-4">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-red">
                Copilot unavailable
              </p>
              <p className="mt-3 text-sm leading-7 text-red">{error}</p>
            </div>
          ) : null}
          <CopilotMessageList isSending={isSending} messages={messages} />
          {isLoading ? (
            <p className="mt-4 text-sm text-muted">Loading case conversation...</p>
          ) : null}
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]">
          <CopilotSuggestedPrompts
            onSelect={useSuggestedPrompt}
            prompts={suggestedPrompts}
            selectedPrompt={selectedPrompt}
          />
        </Card>

        <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                Compose
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
                Ask a focused case question
              </h3>
            </div>
            <DashboardStatusPill label="Persistent thread" tone="positive" />
          </div>

          <div className="mt-5">
            <CopilotComposer
              draft={draft}
              isSending={isSending}
              onChange={setDraft}
              onSend={sendDraft}
            />
          </div>
        </Card>

        <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            Copilot guidance
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <li>Ask for the single next move instead of broad generic advice.</li>
            <li>Use comparisons only after the primary route is stable.</li>
            <li>Ground follow-up questions in missing evidence or timeline pressure.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
