import { ImmigrationTimeline } from "@/components/dashboard/immigration-timeline";
import { immigrationTimelineMock } from "@/lib/immigration-timeline-mocks";

export function ImmigrationTimelineExample() {
  return <ImmigrationTimeline timeline={immigrationTimelineMock} />;
}
