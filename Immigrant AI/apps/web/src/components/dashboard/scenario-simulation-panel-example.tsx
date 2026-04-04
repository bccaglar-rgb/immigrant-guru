import { ScenarioSimulationPanel } from "@/components/dashboard/scenario-simulation-panel";
import { scenarioSimulationMockBaseline } from "@/lib/scenario-simulation";

export function ScenarioSimulationPanelExample() {
  return <ScenarioSimulationPanel baseline={scenarioSimulationMockBaseline} />;
}
