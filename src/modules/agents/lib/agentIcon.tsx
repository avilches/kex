import { RoboticIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import claudeCodeUrl from "@/modules/agents/assets/claudecode-color.svg";
import codexUrl from "@/modules/agents/assets/codex-color.svg";
import geminiCliUrl from "@/modules/agents/assets/geminicli-color.svg";

function svgUrlFor(agent: string): string | null {
  const a = agent.toLowerCase();
  if (a.includes("claude")) return claudeCodeUrl;
  if (a.includes("codex") || a.includes("gpt") || a.includes("openai")) return codexUrl;
  if (a.includes("gemini")) return geminiCliUrl;
  return null;
}

export function AgentIcon({
  agent,
  size = 15,
  className,
}: {
  agent: string;
  size?: number;
  className?: string;
}) {
  if (agent.toLowerCase().includes("kex")) {
    return (
      <img
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size }}
      />
    );
  }

  const svgUrl = svgUrlFor(agent);
  if (svgUrl) {
    return (
      <img
        src={svgUrl}
        alt={agent}
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <HugeiconsIcon
      icon={RoboticIcon}
      size={size}
      strokeWidth={1.75}
      className={className}
    />
  );
}
