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
import { cn } from "@/lib/utils";
import {
  commitRunOnStartEdit,
  effectiveRunOnStartCommand,
  syncFollowedCommand,
} from "@/modules/terminal/lib/runOnStartCommand";
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
  const [open, setOpen] = useState(false);
  const sessionId = agentSession?.meta?.sessionId;

  // Preview of the command the next launch will run, from the same Rust code as the startup
  // restore plan. undefined = not fetched yet, null = no plan (plain editable command).
  const [previewPlan, setPreviewPlan] = useState<RestorePlan | null | undefined>(undefined);
  useEffect(() => {
    if (!open || !agentSession) {
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
  }, [open, tab.id, agentSession, sessionId]);

  // Agents default to restore=true; plain terminals default to false.
  const enabled = agentSession ? tab.restoreOnRestart !== false : (tab.restoreOnRestart ?? false);

  const [draft, setDraft] = useState<string | null>(null);
  const plain = !agentSession || (previewPlan !== undefined && !previewPlan?.resumeCmd && !previewPlan?.errorReason);

  // A followed command has to reach the persisted tab, otherwise restart would replay a stale one.
  useEffect(() => {
    if (!open || !enabled || !plain) return;
    const patch = syncFollowedCommand(tab, running);
    if (patch) onUpdateTab(tab.id, (p) => (p.kind === "terminal" ? { ...p, ...patch } : p));
  }, [open, enabled, plain, tab, running, onUpdateTab]);

  const commitDraft = () => {
    if (draft === null) return;
    const patch = commitRunOnStartEdit(draft, running);
    setDraft(null);
    onUpdateTab(tab.id, (p) => (p.kind === "terminal" ? { ...p, ...patch } : p));
  };

  const commandField =
    agentSession && previewPlan === undefined ? (
      <div className="h-6 w-full rounded border border-border/60 bg-background/50 px-1.5 py-1 text-[11px] text-muted-foreground">
        &hellip;
      </div>
    ) : agentSession && previewPlan?.resumeCmd ? (
      <input
        type="text"
        readOnly
        disabled={!enabled}
        value={previewPlan.resumeCmd}
        title={previewPlan.resumeCmd}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => e.stopPropagation()}
        className="h-6 w-full cursor-text rounded border border-border/60 bg-background/50 px-1.5 font-mono text-[11px] text-muted-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    ) : agentSession && previewPlan?.errorReason ? (
      <div className="break-words px-0.5 py-1 text-[11px] text-destructive">
        {previewPlan.errorReason}
      </div>
    ) : (
      <input
        type="text"
        disabled={!enabled}
        placeholder="command to run (e.g. lazygit)"
        value={draft ?? effectiveRunOnStartCommand(tab, running)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          e.stopPropagation();
        }}
        className={cn(INPUT_CLASS, "font-mono disabled:cursor-not-allowed disabled:opacity-50")}
      />
    );

  return (
    <ContextMenuSub onOpenChange={setOpen}>
      <ContextMenuSubTrigger className="gap-2">
        <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />
        Run on Start
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-80">
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
        <div className="p-1.5">{commandField}</div>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
