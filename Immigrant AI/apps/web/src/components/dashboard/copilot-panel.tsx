"use client";

import { useTranslations } from "next-intl";
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

function buildMapMessage(
  t: (key: string) => string
): (message: CopilotThreadMessage) => CaseWorkspaceCopilotMessage | null {
  return (message) => {
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
                label: `${suggestedActions.length} ${suggestedActions.length === 1 ? t("suggested action") : t("suggested actions")}`,
                type: "strategy" as const
              }
            ]
          : []),
        ...(relatedRisks.length > 0
          ? [
              {
                id: `${message.id}-risks`,
                label: `${relatedRisks.length} ${relatedRisks.length === 1 ? t("related risk") : t("related risks")}`,
                type: "case" as const
              }
            ]
          : [])
      ],
      timestamp: message.created_at
    };
  };
}

export function CopilotPanel({
  accessToken,
  caseId,
  suggestedPrompts,
  summary
}: CopilotPanelProps) {
  const t = useTranslations();
  const { clearSession } = useAuthSession();
  const defaultPrompts = useMemo(
    () => [
      t("What should I focus on next for this case"),
      t("Which missing document matters most right now"),
      t("What weakens the current pathway the most")
    ],
    [t]
  );
  const prompts = suggestedPrompts ?? defaultPrompts;
  const mapMessage = useMemo(() => buildMapMessage(t), [t]);
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
  }, [accessToken, caseId, clearSession, mapMessage]);

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
      t(
        "Ask focused, case-aware questions to turn current evidence, risk signals, and next actions into a practical execution sequence"
      ),
    [summary, t]
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
      <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)] md:p-7">
        <div className="flex flex-col gap-4 border-b border-line/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
              {t("Immigration copilot")}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {t("Case advisory conversation")}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
              {panelSummary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DashboardStatusPill label={t("Action-oriented")} tone="accent" />
            <DashboardStatusPill label={t("Case context")} tone="neutral" />
          </div>
        </div>

        <div className="mt-6">
          {error ? (
            <div className="mb-5 rounded-xl border border-red/20 bg-red/5 px-4 py-4">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-red">
                {t("Copilot unavailable")}
              </p>
              <p className="mt-3 text-sm leading-7 text-red">{error}</p>
            </div>
          ) : null}
          <CopilotMessageList isSending={isSending} messages={messages} />
          {isLoading ? (
            <p className="mt-4 text-sm text-muted">{t("Loading case conversation")}</p>
          ) : null}
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]">
          <CopilotSuggestedPrompts
            onSelect={useSuggestedPrompt}
            prompts={prompts}
            selectedPrompt={selectedPrompt}
          />
        </Card>

        <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                {t("Compose")}
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
                {t("Ask a focused case question")}
              </h3>
            </div>
            <DashboardStatusPill label={t("Persistent thread")} tone="positive" />
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
            {t("Copilot guidance")}
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <li>{t("Ask for the single next move instead of broad generic advice")}</li>
            <li>{t("Use comparisons only after the primary route is stable")}</li>
            <li>{t("Ground follow-up questions in missing evidence or timeline pressure")}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
