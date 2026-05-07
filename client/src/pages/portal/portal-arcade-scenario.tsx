import { useParams } from "wouter";
import ScenarioPlayer from "@/pages/arcade/scenario-player";

export default function PortalArcadeScenario() {
  const { token } = useParams<{ token: string; assignmentId: string }>();
  return <ScenarioPlayer portalToken={token} />;
}
