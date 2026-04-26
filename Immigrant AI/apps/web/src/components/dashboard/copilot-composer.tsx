"use client";

import { useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type CopilotComposerProps = Readonly<{
  draft: string;
  isSending: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
}>;

export function CopilotComposer({
  draft,
  isSending,
  onChange,
  onSend
}: CopilotComposerProps) {
  const t = useTranslations();

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <div className="space-y-4">
      <Textarea
        className="min-h-[168px] rounded-[24px] border-line bg-canvas/70"
        helperText={t("Use a direct, case-specific question — press Cmd/Ctrl + Enter to send")}
        label={t("Ask the copilot")}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("Ask what to do next, which document matters most, or why one route is stronger than another")}
        value={draft}
      />
      <Button
        disabled={isSending || draft.trim().length === 0}
        fullWidth
        onClick={onSend}
        size="lg"
        type="button"
      >
        {isSending ? t("Copilot is responding") : t("Send to copilot")}
      </Button>
    </div>
  );
}
