import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pathBasename } from "@/lib/pathUtils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  getRunningCommandsSnapshot,
  getScriptRunningSnapshot,
  subscribeToRunningCommands,
  subscribeToScriptRunning,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { hibernateReview, isReviewEmpty, liveAgent, type BusyRow } from "@/modules/workspaces/lib/hibernateReview";
import { scriptsToDelete, type RunningProcess } from "@/modules/workspaces/lib/useCloseWorkspaceFlow";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import type { Workspace } from "@/modules/workspaces/lib/types";

type Props = {
  workspace: Workspace | null;
  groupLabel?: string;
  // "close" reuses the hibernate review to warn about what closing destroys.
  mode?: "hibernate" | "close";
  processes?: RunningProcess[];
  onClose: () => void;
  onHibernate: () => void;
  onSaveTab: (tabId: string) => Promise<void>;
  onSaveAll: (tabIds: string[]) => Promise<void>;
  onEnableRunOnStart: (tabId: string, runningCommand?: string) => void;
  onStopBusy: (row: BusyRow) => void;
};

export function HibernateDialog({ workspace, groupLabel, mode = "hibernate", processes = [], onClose, onHibernate, onSaveTab, onSaveAll, onEnableRunOnStart, onStopBusy }: Props) {
  const sessions = useAgentStore((s) => s.sessions);
  const commands = useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot);
  const scriptStates = useSyncExternalStore(subscribeToScriptRunning, getScriptRunningSnapshot);
  const review = useMemo(
    () =>
      workspace
        ? hibernateReview(workspace, {
            agentOf: (id) => liveAgent(sessions[id]),
            runningCommand: (id) => commands.get(id),
            scriptState: (id) => scriptStates.get(id),
          })
        : null,
    [workspace, sessions, commands, scriptStates],
  );

  const closing = mode === "close";
  const deletedScripts = workspace ? scriptsToDelete(workspace) : 0;
  // A hibernated workspace has no mounted editors, so there is nothing to save through.
  const canSave = !workspace?.hibernated;
  const agents = review?.busy.filter((b) => b.kind === "agent") ?? [];
  const scripts = review?.busy.filter((b) => b.kind === "script") ?? [];
  const onlyAgentsPending =
    agents.length > 0 && scripts.length === 0 && review?.docs.length === 0 && review?.commands.length === 0;

  // Radix keeps the content mounted during the exit animation, after `workspace` is already null.
  const shown = useRef<{ workspace: Workspace; groupLabel?: string } | null>(null);
  if (workspace) shown.current = { workspace, groupLabel };
  const titleWs = shown.current?.workspace;
  const titleGroup = shown.current?.groupLabel;

  // The dialog only opens when something is pending: once everything is
  // resolved there is nothing left to warn about, so it closes and hibernates.
  useEffect(() => {
    if (!closing && workspace && review && isReviewEmpty(review)) onHibernate();
  }, [closing, workspace, review, onHibernate]);

  return (
    <AlertDialog open={workspace !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="grid-cols-[minmax(0,1fr)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {titleWs && (
              <WorkspaceMark id={titleWs.id} color={titleWs.color} icon={titleWs.icon} size={18} />
            )}
            <span className="truncate">
              {`${closing ? "Close" : "Hibernate"} ${titleWs?.title ? `"${titleWs.title}"` : "this workspace"}?`}
            </span>
            {titleGroup && (
              <span className="max-w-[40%] shrink-0 truncate text-[12px] font-normal text-muted-foreground">
                {titleGroup}
              </span>
            )}
          </AlertDialogTitle>
        </AlertDialogHeader>
        {agents.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">
              {closing ? "Agents that will be killed" : "Waiting for these agents to finish"}
            </h3>
            {agents.map((b) => (
              <div key={b.tabId} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                  <AgentIcon agent={b.agent ?? b.name} size={12} className="shrink-0" />
                  <span className="truncate">{b.name}</span>
                  <span className="size-[8px] shrink-0 animate-spin rounded-full border border-transparent border-t-foreground/70" />
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {!closing && b.runOnStart && (
                    <Button
                      size="sm"
                      variant="outline"
                      title="Run this agent again when the workspace is restored"
                      onClick={() => onEnableRunOnStart(b.tabId, commands.get(b.tabId))}
                    >
                      Run on start
                    </Button>
                  )}
                  {!closing && (
                    <Button
                      size="sm"
                      variant="outline"
                      title="Interrupt this agent so the workspace can hibernate now"
                      onClick={() => onStopBusy(b)}
                    >
                      Kill
                    </Button>
                  )}
                </span>
              </div>
            ))}
            {!closing && onlyAgentsPending && (
              <p className="text-[12px] text-muted-foreground">
                The workspace will hibernate as soon as they are done.
              </p>
            )}
          </section>
        )}
        {scripts.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Running scripts that will be stopped</h3>
            {scripts.map((b) => (
              <div key={b.tabId} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                  <HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={2} className="shrink-0" />
                  <span className="truncate">{b.name}</span>
                </span>
                {!closing && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={b.stopping}
                    title="Stop this script"
                    onClick={() => onStopBusy(b)}
                  >
                    {b.stopping ? "Stopping" : "Stop"}
                  </Button>
                )}
              </div>
            ))}
          </section>
        )}
        {review && review.docs.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">
              {closing ? "Unsaved documents that will be discarded" : "Unsaved documents"}
            </h3>
            {review.docs.map((d) => (
              <div key={d.tabId} className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-muted-foreground" title={d.path}>
                  {pathBasename(d.path)}
                </span>
                {canSave && (
                  <Button size="sm" variant="outline" className="shrink-0" title="Save this document" onClick={() => void onSaveTab(d.tabId)}>
                    Save
                  </Button>
                )}
              </div>
            ))}
            {canSave && review.docs.length > 2 && (
              <Button
                size="sm"
                className="self-end"
                title="Save every unsaved document"
                onClick={() => void onSaveAll(review.docs.map((d) => d.tabId))}
              >
                Save all
              </Button>
            )}
          </section>
        )}
        {closing && processes.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Running processes that will be killed</h3>
            {processes.map((p) => (
              <span key={p.tabId} className="truncate font-mono text-[12px] text-muted-foreground" title={p.label}>
                {p.label}
              </span>
            ))}
          </section>
        )}
        {closing && deletedScripts > 0 && (
          <p className="text-[12px] text-muted-foreground">
            {deletedScripts === 1 ? "1 script" : `${deletedScripts} scripts`} will be deleted.
          </p>
        )}
        {!closing && review && review.commands.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Commands that will not come back</h3>
            {review.commands.map((c) => (
              <div key={c.tabId} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[12px] text-muted-foreground" title={c.command}>
                  {c.command}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  title="Run this command again when the workspace is restored"
                  onClick={() => onEnableRunOnStart(c.tabId, commands.get(c.tabId))}
                >
                  Run on start
                </Button>
              </div>
            ))}
          </section>
        )}
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose}>
            {closing ? "Cancel" : "Close"}
          </Button>
          <Button onClick={onHibernate} autoFocus>
            {closing ? "Close workspace" : review && review.busy.length > 0 ? "Hibernate now" : "Hibernate anyway"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
