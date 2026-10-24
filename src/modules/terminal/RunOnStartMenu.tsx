import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowReloadHorizontalIcon, Copy01Icon, Delete02Icon, PlayIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { writeClipboardText } from "@/lib/clipboard";
import { previewResumeCmd, type RestorePlan } from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  getRunningCommandsSnapshot,
  getRunningScriptCommand,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { cn } from "@/lib/utils";
import { INPUT_CLASS } from "@/settings/components/inputClass";
import {
  commandOnEnable,
  commitRunOnStartEdit,
  effectiveRunOnStartCommand,
  followableCommand,
  syncFollowedCommand,
} from "@/modules/terminal/lib/runOnStartCommand";
import { usePendingRestore } from "@/modules/terminal/lib/pendingRestore";
import { pendingCdLine, runOnStartSections } from "@/modules/terminal/lib/runOnStartSections";
import { discardPendingRestore, retryPendingRestore } from "@/modules/terminal/lib/useTerminalSession";
import type { Tab } from "@/modules/workspaces/lib/types";

type Props = {
  tab: Extract<Tab, { kind: "terminal" }>;
  onUpdateTab: (tabId: string, updater: (p: Tab) => Tab) => void;
};

const MENU_INPUT_CLASS = cn(
  INPUT_CLASS,
  "h-6 border-border/60 bg-background/50 px-1.5 text-[11px] focus:border-primary",
);

export function RunOnStartMenu({ tab, onUpdateTab }: Props) {
  const agentSession = useAgentStore((s) => s.sessions[tab.id] ?? null);
  const reported =
    useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot).get(tab.id) ??
    null;
  const running = followableCommand(reported, getRunningScriptCommand(tab.id));
  const pending = usePendingRestore(tab.id);
  const sections = runOnStartSections(pending);
  const cdLine = pending ? pendingCdLine(pending) : "";
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

  // Escape and outside clicks unmount the field without a blur, so closing persists the edit.
  const latest = useRef(commitDraft);
  latest.current = commitDraft;
  useEffect(() => () => latest.current(), []);

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
    ) : agentSession && previewPlan?.errorReason && sections.showOldError ? (
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
        className={cn(MENU_INPUT_CLASS, "font-mono disabled:cursor-not-allowed disabled:opacity-50")}
      />
    );

  const shownCommand = agentSession
    ? (previewPlan?.resumeCmd ?? "")
    : (draft ?? effectiveRunOnStartCommand(tab, running));

  return (
    <ContextMenuSub
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) commitDraft();
      }}
    >
      <ContextMenuSubTrigger className={cn("gap-2", pending && "text-destructive focus:text-destructive data-open:text-destructive")}>
        <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2} />
        <span className="min-w-0 flex-1">Run on Start</span>
        {enabled && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-80">
        {sections.showEnabled && (
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              const next = !enabled;
              onUpdateTab(tab.id, (p) => ({
                ...p,
                restoreOnRestart: next,
                persistentCommand: next
                  ? commandOnEnable(tab, running, agentSession !== null)
                  : tab.persistentCommand,
              }));
            }}
          >
            {enabled ? "Disable" : "Enable"}
          </ContextMenuItem>
        )}
        {pending ? (
          <>
            <div className="flex flex-col gap-1 px-2.5 py-1.5">
              <span className="text-[12px] font-medium text-destructive">Restore pending</span>
              <span className="select-text break-words text-[11px]">{pending.reason}</span>
              <code className="select-text break-words font-mono text-[11px]">
                {cdLine && <div>{cdLine}</div>}
                <div>{pending.command}</div>
              </code>
            </div>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="gap-2"
              onSelect={() =>
                void retryPendingRestore(tab.id).catch((e) => console.error("[kex] retry restore failed:", e))
              }
            >
              <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} strokeWidth={2} />
              Retry restore
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              className="gap-2"
              onSelect={() =>
                void discardPendingRestore(tab.id).catch((e) => console.error("[kex] discard restore failed:", e))
              }
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
              Discard restore plan
            </ContextMenuItem>
          </>
        ) : (
          <>
            <div className="p-1.5">{commandField}</div>
            {shownCommand.trim() !== "" && (
              <ContextMenuItem className="gap-2" onSelect={() => void writeClipboardText(shownCommand)}>
                <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={2} />
                Copy command
              </ContextMenuItem>
            )}
          </>
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
