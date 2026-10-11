import { useEffect, useState, useSyncExternalStore } from "react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ContextMenuCheckboxItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { previewResumeCmd, type RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  getRunningCommandsSnapshot,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import type { Tab } from "@/modules/workspaces/lib/types";

type Props = {
  tab: Extract<Tab, { kind: "terminal" }>;
  onUpdateTab: (tabId: string, updater: (p: Tab) => Tab) => void;
};

const INPUT_CLASS =
  "h-6 w-full rounded border border-border/60 bg-background px-1.5 text-[11px] text-foreground outline-none focus:border-primary";

export function RunOnStartMenu({ tab, onUpdateTab }: Props) {
  const agentSession = useAgentStore((s) => s.sessions[tab.id] ?? null);
  const running =
    useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot).get(tab.id) ??
    null;
  const [commandOpen, setCommandOpen] = useState(false);
  const sessionId = agentSession?.meta?.sessionId;

  // Preview of the command the next launch will run, from the same Rust code as the startup
  // restore plan. undefined = not fetched yet, null = no plan (plain editable command).
  const [previewPlan, setPreviewPlan] = useState<RestorePlan | null | undefined>(undefined);
  useEffect(() => {
    if (!commandOpen || !agentSession) {
      setPreviewPlan(undefined);
      return;
    }
    let cancelled = false;
    setPreviewPlan(undefined);
    void previewResumeCmd(tab.id).then((plan) => {
      if (!cancelled) setPreviewPlan(plan);
    });
    return () => {
      cancelled = true;
    };
  }, [commandOpen, tab.id, agentSession, sessionId]);

  // Agents default to restore=true; plain terminals default to false.
  const enabled = agentSession ? tab.restoreOnRestart !== false : (tab.restoreOnRestart ?? false);

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="gap-2">
        <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />
        Run on Start
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-56">
        <ContextMenuCheckboxItem
          checked={enabled}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={(next) =>
            onUpdateTab(tab.id, (p) => ({
              ...p,
              restoreOnRestart: next,
              persistentCommand: next
                ? (tab.persistentCommand ?? running ?? undefined)
                : tab.persistentCommand,
            }))
          }
        >
          Enabled
        </ContextMenuCheckboxItem>
        <ContextMenuSub onOpenChange={setCommandOpen}>
          <ContextMenuSubTrigger className="gap-2">Command</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-80 p-2">
            {agentSession && previewPlan === undefined ? (
              <div className="h-6 w-full rounded border border-border/60 bg-background/50 px-1.5 py-1 text-[11px] text-muted-foreground">
                &hellip;
              </div>
            ) : agentSession && previewPlan?.resumeCmd ? (
              <input
                type="text"
                readOnly
                value={previewPlan.resumeCmd}
                title={previewPlan.resumeCmd}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-6 w-full cursor-text rounded border border-border/60 bg-background/50 px-1.5 font-mono text-[11px] text-muted-foreground outline-none focus:border-primary"
              />
            ) : agentSession && previewPlan?.errorReason ? (
              <div className="break-words px-0.5 py-1 text-[11px] text-destructive">
                {previewPlan.errorReason}
              </div>
            ) : (
              <input
                type="text"
                placeholder="command to run (e.g. lazygit)"
                defaultValue={tab.persistentCommand ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  onUpdateTab(tab.id, (p) => ({ ...p, persistentCommand: v || undefined }));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  e.stopPropagation();
                }}
                className={INPUT_CLASS}
              />
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
