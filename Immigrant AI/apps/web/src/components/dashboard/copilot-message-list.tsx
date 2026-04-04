"use client";

import { useEffect, useRef } from "react";

import { CopilotMessageBubble } from "@/components/dashboard/copilot-message-bubble";
import type { CaseWorkspaceCopilotMessage } from "@/types/case-workspace";

type CopilotMessageListProps = Readonly<{
  isSending: boolean;
  messages: CaseWorkspaceCopilotMessage[];
}>;

function LoadingBubble() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-[28px] border border-blue-100/90 bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(219,234,254,0.78))] px-5 py-4 shadow-[0_18px_38px_rgba(15,23,42,0.06)] md:max-w-[80%]">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
          Immigration copilot
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-300 anim-pulse" />
          <span className="h-2.5 w-2.5 rounded-full bg-blue-400 anim-pulse [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500 anim-pulse [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-[30px] border border-dashed border-line bg-canvas/60 px-6 py-10 text-center">
      <div className="max-w-md">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
          Copilot ready
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
          Start with a practical case question
        </h3>
        <p className="mt-3 text-sm leading-7 text-muted">
          Ask what to upload next, which weakness matters most, or how to strengthen the leading pathway before spending more effort.
        </p>
      </div>
    </div>
  );
}

export function CopilotMessageList({
  isSending,
  messages
}: CopilotMessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isSending, messages]);

  if (messages.length === 0 && !isSending) {
    return <EmptyState />;
  }

  return (
    <div className="max-h-[720px] space-y-4 overflow-y-auto pr-1">
      {messages.map((message) => (
        <CopilotMessageBubble key={message.id} message={message} />
      ))}
      {isSending ? <LoadingBubble /> : null}
      <div ref={endRef} />
    </div>
  );
}
