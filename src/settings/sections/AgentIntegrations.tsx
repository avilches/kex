import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { KNOWN_AGENTS, type KnownAgent, type RowState, rowStateOf } from "@/modules/agents/lib/agentRows";
import { type BulkKind, type BulkResult, planBulk, runBulk } from "@/modules/agents/lib/bulkIntegration";
import {
  AGENT_LABELS,
  type AgentId,
  INTEGRATION_BUSY_JITTER_MS,
  INTEGRATION_MIN_BUSY_MS,
  type IntegrationStatus,
} from "@/modules/agents/lib/integrations";
import { useDetectedAgentIds } from "@/modules/agents/lib/useDetectedAgents";
import { type IntegrationState, useIntegration } from "@/modules/agents/lib/useIntegration";
import { useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification03Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { AgentIntegrationRow } from "./AgentIntegrationRow";
import { AgentStatusRow } from "./AgentStatusRow";

const OPTIONS = { minBusyMs: INTEGRATION_MIN_BUSY_MS, busyJitterMs: INTEGRATION_BUSY_JITTER_MS };

const FILES: Record<AgentId, string[]> = {
  codex: ["~/.codex/hooks.json", "~/.codex/config.toml"],
  claude: ["~/.claude/settings.json"],
  opencode: ["~/.config/opencode/plugins/opencode-session.js"],
  omp: ["~/.omp/agent/extensions/kex-agent-status.ts"],
  pi: ["~/.pi/agent/extensions/kex-agent-status.ts"],
};

const ROW_ORDER = ["codex", "claude", "opencode", "omp", "pi"];
const rank = (a: KnownAgent) => {
  const i = ROW_ORDER.indexOf(a.id);
  return i === -1 ? ROW_ORDER.length : i;
};
const rows = [...KNOWN_AGENTS].sort((a, b) => rank(a) - rank(b));

function bulkSummary(kind: BulkKind, result: BulkResult): string {
  const names = (ids: AgentId[]) => ids.map((a) => AGENT_LABELS[a]).join(", ");
  const parts = [
    [kind === "install" ? "Installed" : "Uninstalled", result.done],
    ["Failed", result.failed],
    ["Skipped", result.skipped],
  ] as const;
  return parts
    .filter(([, ids]) => ids.length > 0)
    .map(([label, ids]) => `${label}: ${names(ids)}`)
    .join(". ");
}

export function AgentIntegrations() {
  const claude = useIntegration("claude", OPTIONS);
  const opencode = useIntegration("opencode", OPTIONS);
  const omp = useIntegration("omp", OPTIONS);
  const pi = useIntegration("pi", OPTIONS);
  const codex = useIntegration("codex", OPTIONS);

  const stateOf: Record<AgentId, IntegrationState> = { claude, opencode, omp, pi, codex };
  const detected = useDetectedAgentIds();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const rowStates: Partial<Record<AgentId, RowState>> = {};
  for (const agent of KNOWN_AGENTS) {
    if (!agent.integration) continue;
    const s = stateOf[agent.integration];
    const status: IntegrationStatus | null =
      s.blocked ?? (s.ready === null ? null : s.ready ? "installed" : "missing");
    rowStates[agent.integration] = rowStateOf({
      detected: detected.has(agent.id),
      hasIntegration: true,
      status,
    });
  }
  const installPlan = planBulk("install", rowStates);
  const removePlan = planBulk("remove", rowStates);

  const bulk = async (kind: BulkKind) => {
    setBulkBusy(true);
    try {
      const result = await runBulk(kind, rowStates, async (a) => {
        const ok = await (kind === "install" ? stateOf[a].install() : stateOf[a].remove());
        if (!ok) throw new Error(`${a} failed`);
      });
      const text = bulkSummary(kind, result);
      if (result.failed.length > 0) toast.error(text);
      else toast.success(text);
    } finally {
      setBulkBusy(false);
    }
  };
  const installAll = () => bulk("install");
  const uninstallAll = () => bulk("remove");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2.5">
        <Benefit
          icon={Notification03Icon}
          title="Spinner and notifications"
          text="See when your agent is working or needs you. Kex is notified when your agent or its subagents finish."
        />
        <Benefit
          icon={Refresh01Icon}
          title="Sessions survive"
          text="Undo a closed tab or hibernate one without losing your session transcript."
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="destructive"
          className="h-8 px-2.5 text-[11px]"
          disabled={removePlan.length === 0 || bulkBusy}
          onClick={() => setConfirmingRemove(true)}
        >
          Uninstall all
        </Button>
        <Button
          size="sm"
          className="h-8 px-2.5 text-[11px]"
          disabled={installPlan.length === 0 || bulkBusy}
          onClick={() => void installAll()}
        >
          Install all
        </Button>
      </div>
      <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 bg-card/60">
        {rows.map((agent) => {
          const integration = agent.integration;
          if (!integration) {
            return (
              <AgentStatusRow
                key={agent.id}
                agent={agent}
                state={detected.has(agent.id) ? "detectedOnly" : "notDetected"}
              />
            );
          }
          return (
            <AgentIntegrationRow
              key={agent.id}
              agent={integration}
              name={agent.name}
              files={FILES[integration]}
              state={stateOf[integration]}
              detected={detected.has(agent.id)}
            />
          );
        })}
      </div>
      <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall all integrations?</AlertDialogTitle>
            <AlertDialogDescription>
              Kex will remove its integration from: {removePlan.map((a) => AGENT_LABELS[a]).join(", ")}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingRemove(false);
                void uninstallAll();
              }}
            >
              Uninstall all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <p className="text-[10.5px] text-muted-foreground">
        Preview shows what Install would write, or what Uninstall would remove. Nothing is
        touched until you press a button; Install all and Uninstall all act on every detected agent.
      </p>
    </div>
  );
}

function Benefit({
  icon,
  title,
  text,
}: {
  icon: typeof Notification03Icon;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <HugeiconsIcon icon={icon} size={12} strokeWidth={2} />
      </span>
      <div className="flex flex-col">
        <span className="text-[12px] font-medium">{title}</span>
        <span className="text-[10.5px] leading-relaxed text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}
