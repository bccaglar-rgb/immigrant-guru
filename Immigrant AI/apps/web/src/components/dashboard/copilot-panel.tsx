"use client";

import { CopilotComposer } from "@/components/dashboard/copilot-composer";
import { CopilotMessageList } from "@/components/dashboard/copilot-message-list";
import { CopilotSuggestedPrompts } from "@/components/dashboard/copilot-suggested-prompts";
import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Card } from "@/components/ui/card";
import { useCopilotThreadMock } from "@/hooks/use-copilot-thread-mock";
import type { CaseWorkspaceCopilot } from "@/types/case-workspace";

type CopilotPanelProps = Readonly<{
  copilot: CaseWorkspaceCopilot;
}>;

export function CopilotPanel({ copilot }: CopilotPanelProps) {
  const {
    draft,
    isSending,
    messages,
    selectedPrompt,
    sendDraft,
    setDraft,
    useSuggestedPrompt
  } = useCopilotThreadMock(copilot);

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
              {copilot.summary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DashboardStatusPill label="Action-oriented" tone="accent" />
            <DashboardStatusPill label="Case context" tone="neutral" />
          </div>
        </div>

        <div className="mt-6">
          <CopilotMessageList isSending={isSending} messages={messages} />
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.07)]">
          <CopilotSuggestedPrompts
            onSelect={useSuggestedPrompt}
            prompts={copilot.suggestedPrompts}
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
            <DashboardStatusPill label="Mock thread" tone="warning" />
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
