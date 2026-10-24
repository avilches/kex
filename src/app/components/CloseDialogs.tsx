import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { pathBasename } from "@/lib/pathUtils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { previewResumeCmd } from "@/modules/agents/lib/agentSessionRestore";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { commandOnUndoClose, followableCommand } from "@/modules/terminal/lib/runOnStartCommand";
import {
  getRunningCommandsSnapshot,
  getRunningScriptCommand,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { tabIcon } from "@/modules/workspaces/lib/tabTitle";
import type { Tab } from "@/modules/workspaces/lib/types";
import { useAgentTabTitle } from "@/modules/workspaces/lib/useAgentTabTitle";

type TabInfo = { id: string; title: string; kind: string; path?: string; processName?: string; command?: string; tab?: Tab };

/** Command the tab would run if its close were undone, or null when nothing would. */
function useUndoCloseCommand(info: TabInfo | null): string | null {
  // Radix keeps the content mounted during the exit animation, after the pending tab is already null.
  const shown = useRef<TabInfo | null>(null);
  if (info) shown.current = info;
  const current = shown.current;
  const tab = current?.tab ?? null;
  const agentSession = useAgentStore((s) => (current ? (s.sessions[current.id] ?? null) : null));
  const reported = useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot);
  const running = current
    ? followableCommand(reported.get(current.id) ?? null, getRunningScriptCommand(current.id))
    : null;

  const [resumeCmd, setResumeCmd] = useState<string | null>(null);
  const id = current?.id;
  const isAgent = agentSession !== null;
  useEffect(() => {
    setResumeCmd(null);
    if (!info || !isAgent) return;
    let cancelled = false;
    void previewResumeCmd(info.id).then((plan) => {
      if (!cancelled) setResumeCmd(plan?.resumeCmd ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [id, info, isAgent]);

  return tab?.kind === "terminal" ? commandOnUndoClose(tab, running, resumeCmd, isAgent) : null;
}

function TerminalCloseHeader({ info }: { info: TabInfo | null }) {
  // Radix keeps the content mounted during the exit animation, after the pending tab is already null.
  const shown = useRef<TabInfo | null>(null);
  if (info) shown.current = info;
  const current = shown.current;
  const tab = current?.tab ?? null;
  const titleInfo = useAgentTabTitle(tab);

  const name = titleInfo?.displayTitle || current?.title || current?.processName || "terminal";

  return (
    <>
      <AlertDialogHeader className="grid-cols-[minmax(0,1fr)]">
        <AlertDialogTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={Alert02Icon} size={18} className="shrink-0 text-destructive" />
          Close terminal?
        </AlertDialogTitle>
        <div
          className="flex min-w-0 items-center gap-2 text-sm font-medium"
          style={tab?.color ? { color: tab.color } : undefined}
        >
          {tab && (
            <span className="flex shrink-0 items-center">
              {titleInfo?.agentSession && !tab.icon ? (
                <AgentIcon agent={titleInfo.agentSession.agent} size={16} />
              ) : (
                tabIcon(tab, titleInfo?.isRunning)
              )}
            </span>
          )}
          <span className="min-w-0 truncate" title={name}>{name}</span>
        </div>
        <AlertDialogDescription>The running process will be killed</AlertDialogDescription>
      </AlertDialogHeader>
      {current?.command && (
        <p className="break-all font-mono text-[12px] text-muted-foreground">{current.command}</p>
      )}
    </>
  );
}

/** "Run on start" note, rendered below the dialog buttons. */
function TerminalUndoCloseNotice({ info }: { info: TabInfo | null }) {
  const undoCommand = useUndoCloseCommand(info);
  if (!undoCommand) return null;
  return (
    <p className="text-[12px] text-muted-foreground">
      Run on start enabled: you can undo close this tab
    </p>
  );
}

type Props = {
  pendingCloseTab: TabInfo | null;
  onCancelClose: () => void;
  onSaveClose: () => void;
  onDontSaveClose: () => void;
  pendingTerminalCloseTab: TabInfo | null;
  onCancelTerminalClose: () => void;
  onConfirmTerminalClose: (dontAskAgain: boolean) => void;
};

/** Confirmation dialogs for closing dirty editors and terminals with live processes. */
export function CloseDialogs({
  pendingCloseTab,
  onCancelClose,
  onSaveClose,
  onDontSaveClose,
  pendingTerminalCloseTab,
  onCancelTerminalClose,
  onConfirmTerminalClose,
}: Props) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    if (pendingTerminalCloseTab) setDontAskAgain(false);
  }, [pendingTerminalCloseTab]);

  return (
    <>
      <AlertDialog
        open={pendingCloseTab !== null}
        onOpenChange={(open) => !open && onCancelClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(() => {
                const name = pendingCloseTab?.path
                  ? pathBasename(pendingCloseTab.path)
                  : pendingCloseTab?.title;
                return name ? `Close file ${name}?` : "Close file?";
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to close a file with unsaved changes
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingCloseTab?.path && (
            <p className="text-[12px] text-muted-foreground break-all">
              Path: {pendingCloseTab.path}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelClose}>
              Cancel
            </AlertDialogCancel>
            <Button variant="outline" onClick={onDontSaveClose}>
              Don't save
            </Button>
            <AlertDialogAction onClick={onSaveClose} autoFocus>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingTerminalCloseTab !== null}
        onOpenChange={(open) => !open && onCancelTerminalClose()}
      >
        <AlertDialogContent className="grid-cols-[minmax(0,1fr)] data-[size=default]:sm:max-w-lg">
          <TerminalCloseHeader info={pendingTerminalCloseTab} />
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(v) => setDontAskAgain(v === true)}
            />
            Don't ask me again
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelTerminalClose}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onConfirmTerminalClose(dontAskAgain)}
              autoFocus
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
          <TerminalUndoCloseNotice info={pendingTerminalCloseTab} />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
