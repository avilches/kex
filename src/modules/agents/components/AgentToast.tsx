import { toast } from "sonner";
import { AgentIcon } from "../lib/agentIcon";
import { toastBody, toastTitle } from "../lib/toastText";

type AgentToastArgs = {
  agent: string;
  title: string;
  body?: string;
  onActivate: () => void;
};

export function showAgentToast({ agent, title, body, onActivate }: AgentToastArgs) {
  toast(toastTitle(title), {
    description: toastBody(body),
    icon: <AgentIcon agent={agent} size={18} />,
    action: { label: "Open", onClick: onActivate },
    duration: 6000,
  });
}
