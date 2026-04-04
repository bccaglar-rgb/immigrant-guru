import type { CaseWorkspaceCopilotMessage } from "@/types/case-workspace";

import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { cn } from "@/lib/utils";

type CopilotMessageBubbleProps = Readonly<{
  message: CaseWorkspaceCopilotMessage;
}>;

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function sourceTone(
  type: NonNullable<CaseWorkspaceCopilotMessage["sourceAttributions"]>[number]["type"]
): "neutral" | "accent" | "warning" {
  if (type === "strategy" || type === "score") {
    return "accent";
  }
  if (type === "document" || type === "timeline") {
    return "warning";
  }
  return "neutral";
}

export function CopilotMessageBubble({
  message
}: CopilotMessageBubbleProps) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex",
        isAssistant ? "justify-start" : "justify-end"
      )}
    >
      <div
        className={cn(
          "max-w-[92%] rounded-[28px] px-5 py-4 shadow-[0_18px_38px_rgba(15,23,42,0.06)] md:max-w-[80%]",
          isAssistant
            ? "border border-blue-100/90 bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(219,234,254,0.78))]"
            : "border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.82))]"
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            {isAssistant ? "Immigration copilot" : "You"}
          </p>
          <p className="text-xs text-muted">
            {formatTimestamp(message.timestamp)}
          </p>
        </div>

        <p className="mt-3 text-sm leading-7 text-ink/80">
          {message.content}
        </p>

        {isAssistant ? (
          <div className="mt-4 rounded-[22px] border border-white/70 bg-white/70 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
              Source grounding
            </p>
            {message.sourceAttributions && message.sourceAttributions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.sourceAttributions.map((source) => (
                  <DashboardStatusPill
                    key={source.id}
                    label={source.label}
                    tone={sourceTone(source.type)}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted">
                This answer is aligned to current case context. Linked source modules will appear here once grounding is attached.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
