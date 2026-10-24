import { Spinner } from "@/components/ui/spinner";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import { hibernateReview, isBlockedByFailures, isReviewEmpty, liveAgent, type BusyRow } from "@/modules/workspaces/lib/hibernateReview";
import type { RunningProcess } from "@/modules/workspaces/lib/useCloseWorkspaceFlow";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { allPanes, focusedTab } from "@/modules/workspaces/lib/splitNode";
import { workspaceTitleNow } from "@/modules/workspaces/lib/workspaceTitle";
import { tabIcon } from "@/modules/workspaces/lib/tabTitle";
import { useAgentTabTitle } from "@/modules/workspaces/lib/useAgentTabTitle";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { scriptActionOf } from "@/modules/actions/lib/actionStateStore";
import { actionsToDelete, type Tab, type Workspace } from "@/modules/workspaces/lib/types";

// Same icon and title the tab bar shows: a custom tab icon wins over the agent's.
function TabLabel({ tab, command }: { tab: Tab; command?: string }) {
  const info = useAgentTabTitle(tab);
  return (
    <>
      <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
        <span className="flex shrink-0 items-center">
          {info?.agentSession && !tab.icon ? <AgentIcon agent={info.agentSession.agent} size={12} /> : tabIcon(tab, info?.isRunning)}
        </span>
        <span className="truncate">{info?.displayTitle}</span>
      </span>
      <span className="min-w-0 truncate font-mono text-[12px] text-muted-foreground" title={command}>{command}</span>
    </>
  );
}

// Tab, process and actions line up as table columns across the rows of a section.
const ROW_GRID = "grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1";

function CommandOnly({ command }: { command: string }) {
  return (
    <>
      <span aria-hidden />
      <span className="min-w-0 truncate font-mono text-[12px] text-muted-foreground" title={command}>{command}</span>
    </>
  );
}

type Props = {
  workspace: Workspace | null;
  groupLabel?: string;
  // "close" reuses the hibernate review to warn about what closing destroys.
  mode?: "hibernate" | "close";
  processes?: RunningProcess[];
  onClose: () => void;
  onHibernate: () => void;
  // Resolves to the failure reason, or null when the document was saved.
  onSaveTab: (tabId: string) => Promise<string | null>;
  onGoToTab: (tabId: string) => void;
  onEnableRunOnStart: (tabId: string, runningCommand?: string) => void;
  onStopBusy: (row: BusyRow) => void;
};

export function HibernateDialog({ workspace, groupLabel, mode = "hibernate", processes = [], onClose, onHibernate, onSaveTab, onGoToTab, onEnableRunOnStart, onStopBusy }: Props) {
  const sessions = useAgentStore((s) => s.sessions);
  const commands = useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot);
  const scriptStates = useSyncExternalStore(subscribeToScriptRunning, getScriptRunningSnapshot);
  const globalActionList = usePreferencesStore((s) => s.actions);
  const review = useMemo(
    () =>
      workspace
        ? hibernateReview(workspace, {
            agentOf: (id) => liveAgent(sessions[id]),
            runningCommand: (id) => commands.get(id),
            scriptState: (id) => scriptStates.get(id),
            actionOf: (id) => scriptActionOf(id, [workspace.actions ?? [], globalActionList]),
          })
        : null,
    [workspace, sessions, commands, scriptStates, globalActionList],
  );

  const closing = mode === "close";
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [discarded, setDiscarded] = useState<ReadonlySet<string>>(new Set());
  const workspaceId = workspace?.id;
  useEffect(() => {
    setFailures({});
    setDiscarded(new Set());
  }, [workspaceId]);
  const saveDocs = async (tabIds: string[]) => {
    const results = await Promise.all(tabIds.map(async (id) => [id, await onSaveTab(id)] as const));
    setFailures((prev) => {
      const next = { ...prev };
      for (const [id, reason] of results) {
        if (reason === null) delete next[id];
        else next[id] = reason;
      }
      return next;
    });
  };
  const blockedByFailure = isBlockedByFailures(review?.docs ?? [], failures, discarded);
  const deletedScripts = workspace ? actionsToDelete(workspace) : 0;
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
  const titleWsName = titleWs
    ? workspaceTitleNow({ ...titleWs, focusedTab: focusedTab(titleWs.paneTree, titleWs.activePaneId) })
    : "";
  const tabs = useMemo(
    () => new Map(titleWs ? allPanes(titleWs.paneTree).flatMap((p) => p.tabs).map((t) => [t.id, t] as const) : []),
    [titleWs],
  );
  const titleGroup = shown.current?.groupLabel;

  // The dialog only opens when something is pending: once everything is
  // resolved there is nothing left to warn about, so it closes and hibernates.
  useEffect(() => {
    if (!closing && workspace && review && isReviewEmpty(review)) onHibernate();
  }, [closing, workspace, review, onHibernate]);

  return (
    <AlertDialog open={workspace !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="grid-cols-[minmax(0,1fr)] data-[size=default]:sm:max-w-2xl">
        <AlertDialogHeader className="grid-cols-[minmax(0,1fr)]">
          <AlertDialogTitle className="flex items-center gap-2">
            {closing ? "Close workspace?" : "Hibernate workspace?"}
          </AlertDialogTitle>
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            {titleWs && (
              <WorkspaceMark id={titleWs.id} color={titleWs.color} icon={titleWs.icon} size={18} />
            )}
            <span className="min-w-0 truncate" title={titleWsName}>{titleWsName || "this workspace"}</span>
            {titleGroup && (
              <span className="max-w-[40%] shrink-0 truncate text-[12px] font-normal text-muted-foreground">
                {titleGroup}
              </span>
            )}
          </div>
        </AlertDialogHeader>
        {agents.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">
              {closing ? "Agents that will be killed" : "Waiting for these agents to finish"}
            </h3>
            <div className={ROW_GRID}>
            {agents.map((b) => (
              <div key={b.tabId} className="contents">
                {tabs.get(b.tabId) ? (
                  <TabLabel tab={tabs.get(b.tabId)!} command={commands.get(b.tabId)} />
                ) : (
                  <>
                    <span className="min-w-0 truncate text-[12px] text-muted-foreground">{b.name}</span>
                    <span aria-hidden />
                  </>
                )}
                <span className="flex items-center justify-end gap-2">
                  <Spinner size={11} />
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
            </div>
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
            <div className={ROW_GRID}>
            {scripts.map((b) => (
              <div key={b.tabId} className="contents">
                <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                  <HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={2} className="shrink-0" />
                  <span className="truncate">{b.name}</span>
                </span>
                <span className="min-w-0 truncate font-mono text-[12px] text-muted-foreground" title={b.command}>
                  {b.command && b.command !== b.name ? b.command : ""}
                </span>
                <span className="flex items-center justify-end">
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
                </span>
              </div>
            ))}
            </div>
          </section>
        )}
        {review && review.docs.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">
              {closing ? "Unsaved documents that will be discarded" : "Unsaved documents"}
            </h3>
            {review.docs.map((d) => {
              const failure = failures[d.tabId];
              const isDiscarded = discarded.has(d.tabId);
              return (
                <div key={d.tabId} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] text-muted-foreground" title={d.path}>
                      {pathBasename(d.path)}
                    </span>
                    {isDiscarded ? (
                      <span className="shrink-0 text-[12px] text-muted-foreground">Will be discarded</span>
                    ) : failure !== undefined ? (
                      <span className="flex shrink-0 items-center gap-2">
                        <Button size="sm" variant="outline" title="Close this dialog and fix it in its tab" onClick={() => { onClose(); onGoToTab(d.tabId); }}>
                          Go to tab
                        </Button>
                        {closing && (
                          <Button size="sm" variant="outline" title="Lose the unsaved changes of this document" onClick={() => setDiscarded((prev) => new Set(prev).add(d.tabId))}>
                            Discard
                          </Button>
                        )}
                      </span>
                    ) : (
                      canSave && (
                        <Button size="sm" variant="outline" className="shrink-0" title="Save this document" onClick={() => void saveDocs([d.tabId])}>
                          Save
                        </Button>
                      )
                    )}
                  </div>
                  {failure !== undefined && !isDiscarded && (
                    <p className="text-[12px] text-destructive">Could not save: {failure}</p>
                  )}
                </div>
              );
            })}
            {canSave && review.docs.length > 2 && (
              <Button
                size="sm"
                className="self-end"
                title="Save every unsaved document"
                onClick={() => void saveDocs(review.docs.filter((d) => !discarded.has(d.tabId)).map((d) => d.tabId))}
              >
                Save all
              </Button>
            )}
          </section>
        )}
        {closing && processes.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Running processes that will be killed</h3>
            <div className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
              {processes.map((p) => {
                const tab = tabs.get(p.tabId);
                return tab ? (
                  <TabLabel key={p.tabId} tab={tab} command={p.label} />
                ) : (
                  <CommandOnly key={p.tabId} command={p.label} />
                );
              })}
            </div>
          </section>
        )}
        {closing && deletedScripts > 0 && (
          <p className="text-[12px] text-muted-foreground">
            {deletedScripts === 1 ? "1 action" : `${deletedScripts} actions`} will be deleted.
          </p>
        )}
        {!closing && review && review.commands.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Commands that will not come back</h3>
            <div className={ROW_GRID}>
            {review.commands.map((c) => (
              <div key={c.tabId} className="contents">
                {tabs.get(c.tabId) ? (
                  <TabLabel tab={tabs.get(c.tabId)!} command={c.command} />
                ) : (
                  <CommandOnly command={c.command} />
                )}
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
            </div>
          </section>
        )}
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose}>
            {closing ? "Cancel" : "Close"}
          </Button>
          <Button onClick={onHibernate} autoFocus disabled={blockedByFailure}>
            {closing ? "Close workspace" : review && review.busy.length > 0 ? "Hibernate now" : "Hibernate anyway"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
