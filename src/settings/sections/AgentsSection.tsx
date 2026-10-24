import { SectionHeader } from "../components/SectionHeader";
import { AgentIntegrations } from "./AgentIntegrations";

export function AgentsSection() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Agents" />
      <AgentIntegrations />
    </div>
  );
}
