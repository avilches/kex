import { INTEGRATION_MIN_BUSY_MS } from "@/modules/agents/lib/integrations";
import { useIntegration } from "@/modules/agents/lib/useIntegration";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification03Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { FieldLabel } from "../components/FieldLabel";
import { AgentIntegrationRow } from "./AgentIntegrationRow";

const OPTIONS = { minBusyMs: INTEGRATION_MIN_BUSY_MS };

export function AgentIntegrations() {
  const claude = useIntegration("claude", OPTIONS);
  const opencode = useIntegration("opencode", OPTIONS);
  const omp = useIntegration("omp", OPTIONS);
  const pi = useIntegration("pi", OPTIONS);
  const codex = useIntegration("codex", OPTIONS);

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Agents</FieldLabel>
      <div className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <Benefit
          icon={Notification03Icon}
          title="Spinner and attention dot"
          text="See when your agent is working or needs you. Kex is notified when your agent or its subagents finish."
        />
        <Benefit
          icon={Refresh01Icon}
          title="Sessions survive"
          text="Undo a closed tab or hibernate a workspace without losing your session."
        />
      </div>
      <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 bg-card/60">
        <AgentIntegrationRow
          agent="claude"
          name="Claude Code"
          files={["~/.claude/settings.json"]}
          state={claude}
        />
        <AgentIntegrationRow
          agent="opencode"
          name="OpenCode"
          files={["~/.config/opencode/plugins/opencode-session.js"]}
          state={opencode}
        />
        <AgentIntegrationRow
          agent="omp"
          name="OMP"
          files={["~/.omp/agent/extensions/kex-agent-status.ts"]}
          state={omp}
        />
        <AgentIntegrationRow
          agent="pi"
          name="Pi"
          files={["~/.pi/agent/extensions/kex-agent-status.ts"]}
          state={pi}
        />
        <AgentIntegrationRow
          agent="codex"
          name="Codex"
          files={["~/.codex/hooks.json", "~/.codex/config.toml"]}
          state={codex}
        />
      </div>
      <p className="text-[10.5px] text-muted-foreground">
        View changes shows what Install would write, or what Uninstall would remove. Nothing is
        touched until you press the button.
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
