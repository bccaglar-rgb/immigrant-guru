import { CopilotPanel } from "@/components/dashboard/copilot-panel";
import { getCaseWorkspaceMock } from "@/lib/case-workspace-mocks";

export function CopilotPanelExample() {
  const workspace = getCaseWorkspaceMock("copilot-demo");

  return <CopilotPanel copilot={workspace.copilot} />;
}
