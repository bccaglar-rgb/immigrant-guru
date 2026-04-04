import type { CaseWorkspaceCopilotMessage } from "@/types/case-workspace";

const assistantReplyLibrary: ReadonlyArray<{
  content: string;
  sourceAttributions: ReadonlyArray<{
    id: string;
    label: string;
    type: "strategy" | "timeline" | "case" | "document" | "score";
  }>;
}> = [
  {
    content:
      "Your strongest next move is still to close the language evidence gap before broadening the case into new countries. That single improvement would strengthen probability, strategy clarity, and document readiness together.",
    sourceAttributions: [
      {
        id: "assistant-source-strategy",
        label: "Strategy review",
        type: "strategy"
      },
      {
        id: "assistant-source-timeline",
        label: "Timeline forecast",
        type: "timeline"
      }
    ]
  },
  {
    content:
      "If you want the case to feel more submission-ready, focus on one employment evidence package with dates, role scope, and employer confirmation instead of collecting lower-value extra documents.",
    sourceAttributions: [
      {
        id: "assistant-source-docs",
        label: "Document checklist",
        type: "document"
      },
      {
        id: "assistant-source-score",
        label: "Readiness score",
        type: "score"
      }
    ]
  },
  {
    content:
      "A backup country comparison is useful, but only after the primary route is stabilized. Right now, the file will likely benefit more from stronger evidence than from more route exploration.",
    sourceAttributions: [
      {
        id: "assistant-source-case",
        label: "Case comparison context",
        type: "case"
      },
      {
        id: "assistant-source-strategy-2",
        label: "Plan ranking",
        type: "strategy"
      }
    ]
  }
];

function pickAssistantReply(seed: string) {
  const index = seed.length % assistantReplyLibrary.length;

  return assistantReplyLibrary[index];
}

export function buildMockAssistantMessage(
  prompt: string
): CaseWorkspaceCopilotMessage {
  const reply = pickAssistantReply(prompt);

  return {
    content: reply.content,
    id: `assistant-${Date.now()}`,
    role: "assistant",
    sourceAttributions: [...reply.sourceAttributions],
    timestamp: new Date().toISOString()
  };
}
