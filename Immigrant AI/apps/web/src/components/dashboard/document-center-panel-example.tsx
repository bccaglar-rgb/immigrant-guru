import { DocumentCenterPanel } from "@/components/dashboard/document-center-panel";
import { documentCenterMock } from "@/lib/document-center-mocks";

export function DocumentCenterPanelExample() {
  return <DocumentCenterPanel data={documentCenterMock} />;
}
