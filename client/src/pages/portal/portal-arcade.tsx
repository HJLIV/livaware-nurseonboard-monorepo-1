import { useParams } from "wouter";
import NurseDashboard from "@/pages/arcade/nurse-dashboard";

export default function PortalArcade() {
  const { token } = useParams<{ token: string }>();
  return <NurseDashboard portalToken={token || "me"} />;
}
