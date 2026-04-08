import { CopilotPanel } from "@/components/dashboard/copilot-panel";
import { getCaseWorkspaceMock } from "@/lib/case-workspace-mocks";

export function CopilotPanelExample() {
  const workspace = getCaseWorkspaceMock("copilot-demo");

  return (
    <CopilotPanel
      accessToken="demo-token"
      caseId={workspace.header.caseId}
      suggestedPrompts={workspace.copilot.suggestedPrompts}
      summary={workspace.copilot.summary}
    />
  );
}
