import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { cn } from "@/lib/utils";

type CopilotSuggestedPromptsProps = Readonly<{
  onSelect: (prompt: string) => void;
  prompts: string[];
  selectedPrompt: string | null;
}>;

export function CopilotSuggestedPrompts({
  onSelect,
  prompts,
  selectedPrompt
}: CopilotSuggestedPromptsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            Suggested prompts
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Start with one of these focused questions to keep the case conversation practical.
          </p>
        </div>
        <DashboardStatusPill label="Case-aware" tone="accent" />
      </div>

      <div className="flex flex-wrap gap-2.5">
        {prompts.map((prompt) => (
          <button
            className={cn(
              "rounded-full border px-4 py-2.5 text-left text-sm font-medium transition-all",
              selectedPrompt === prompt
                ? "border-accent/20 bg-accent/5 text-accent shadow-[0_12px_28px_rgba(37,99,235,0.12)]"
                : "border-line bg-white text-ink/80 hover:border-ink/20 hover:bg-canvas"
            )}
            key={prompt}
            onClick={() => onSelect(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
