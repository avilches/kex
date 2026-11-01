import { agentStatus } from "@/modules/agents/lib/agentIntegration";
import { KNOWN_AGENTS } from "@/modules/agents/lib/agentRows";
import type { AgentId, IntegrationStatus } from "@/modules/agents/lib/integrations";
import { useDetectedAgentIds } from "@/modules/agents/lib/useDetectedAgents";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { Alert02Icon, CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useState } from "react";
import { agentSummary, styleOf } from "../lib/onboardingSummary";

const INTEGRABLE = KNOWN_AGENTS.filter((a) => a.integration !== null);

function useStatuses(detected: ReadonlySet<string>): Partial<Record<AgentId, IntegrationStatus>> {
  const [statuses, setStatuses] = useState<Partial<Record<AgentId, IntegrationStatus>>>({});
  useEffect(() => {
    let cancelled = false;
    for (const agent of INTEGRABLE) {
      const id = agent.integration;
      if (!id || !detected.has(agent.id)) continue;
      agentStatus(id)
        .then((status) => {
          if (!cancelled) setStatuses((prev) => ({ ...prev, [id]: status }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [detected]);
  return statuses;
}

type Tone = "done" | "pending" | "info";

const TONES: Record<Tone, { icon: typeof Alert02Icon; className: string }> = {
  done: { icon: CheckmarkCircle02Icon, className: "text-green-500" },
  pending: { icon: Alert02Icon, className: "text-amber-500" },
  info: { icon: InformationCircleIcon, className: "text-muted-foreground" },
};

function Line({ tone, title, children }: { tone: Tone; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
      <span className={`mt-px ${TONES[tone].className}`}>
        <HugeiconsIcon icon={TONES[tone].icon} size={16} strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="text-[12px] leading-relaxed text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}

export function DoneStep({ isMac }: { isMac: boolean }) {
  const scheme = usePreferencesStore((s) => s.explorerGitColorScheme);
  const previewOnClick = usePreferencesStore((s) => s.previewOnClick);
  const style = styleOf(scheme, previewOnClick);
  const detected = useDetectedAgentIds();
  const statuses = useStatuses(detected);
  const agents = agentSummary(
    INTEGRABLE.map((a) => ({
      name: a.name,
      detected: detected.has(a.id),
      status: a.integration ? (statuses[a.integration] ?? null) : null,
    })),
  );

  const agentTone: Tone =
    agents.pending.length > 0 ? "pending" : agents.installed.length > 0 ? "done" : "info";
  const agentText = [
    agents.installed.length > 0 && `Connected: ${agents.installed.join(", ")}.`,
    agents.pending.length > 0 && `Still to connect: ${agents.pending.join(", ")}.`,
  ]
    .filter(Boolean)
    .join(" ") || "No agent to connect on this machine yet.";

  return (
    <div className="flex flex-col gap-3">
      <Line tone="done" title="Style">
        {style === "vscode" ? "VS Code" : style === "jetbrains" ? "JetBrains" : "Your own mix"}
      </Line>
      <Line tone={agentTone} title="Coding agents">
        {agentText}
      </Line>
      {isMac && (
        <Line tone="info" title="Folder access">
          Review it anytime in Settings, under Permissions.
        </Line>
      )}
      <p className="text-[12px] text-muted-foreground">
        Everything here lives in Settings too, so you can change it whenever you like.
      </p>
    </div>
  );
}
