import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import type { KnownAgent } from "@/modules/agents/lib/agentRows";

type Props = {
  agent: KnownAgent;
  state: "notDetected" | "detectedOnly";
};

export function AgentStatusRow({ agent, state }: Props) {
  const detected = state === "detectedOnly";
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <AgentIcon
        agent={agent.id}
        size={22}
        className={cn("shrink-0", !detected && "opacity-50")}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[12.5px] font-medium">
          {agent.name}
          <StatusLabel detected={detected} />
        </span>
        {!detected && <NotDetectedHint name={agent.name} />}
      </div>
    </div>
  );
}

export function StatusLabel({ detected }: { detected: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-[11px] font-normal",
        detected ? "text-green-500" : "text-muted-foreground",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {detected ? "Detected" : "Not detected"}
    </span>
  );
}

export function NotDetectedHint({ name }: { name: string }) {
  return (
    <span className="text-[10.5px] text-muted-foreground">
      Install {name} and make sure it is on your PATH, then reopen Kex.
    </span>
  );
}
