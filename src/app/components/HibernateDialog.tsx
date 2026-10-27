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
import { Checkbox } from "@/components/ui/checkbox";
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
import { canSilenceWarning, hibernateReview, isBlockedByFailures, isReviewEmpty, liveAgent, tabsReview, type BusyRow, type HibernateReview } from "@/modules/workspaces/lib/hibernateReview";
import { processMap, type RunningProcess } from "@/modules/workspaces/lib/useCloseWorkspaceFlow";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import { allPanes, focusedTab } from "@/modules/workspaces/lib/splitNode";
import { workspaceTitleNow } from "@/modules/workspaces/lib/workspaceTitle";
import { tabIcon } from "@/modules/workspaces/lib/tabTitle";
import { useAgentTabTitle } from "@/modules/workspaces/lib/useAgentTabTitle";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { scriptActionOf } from "@/modules/actions/lib/actionStateStore";
import { actionsToDelete, type Tab, type Workspace } from "@/modules/workspaces/lib/types";
import { useRestoreCommand } from "./useRestoreCommand";

// Same icon and title the tab bar shows: a custom tab icon wins over the agent's. Under the row
// goes the command the tab runs when it comes back.
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

// A full-width line under a row, after its last cell so it never shifts the columns.
function RestoreFor({ tab }: { tab: Tab }) {
  const command = useRestoreCommand(tab);
  if (!command) return null;
  return (
    <span className="col-span-full min-w-0 truncate pl-5 text-[11px] text-muted-foreground/80" title={command}>
      Runs again on restore: <span className="font-mono">{command}</span>
    </span>
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

export type DialogMode = "hibernate" | "close" | "close-tab";

type Props = {
  workspace: Workspace | null;
  // "hibernate" and "close-tab" review only these tabs; the rest of the workspace is not reviewed.
  tabIds?: string[];
  groupLabel?: string;
  mode?: DialogMode;
  processes?: RunningProcess[];
  onClose: () => void;
  // `dontAskAgain` is only true when the review allowed silencing the warning and it was checked.
  onConfirm: (dontAskAgain: boolean) => void;
  // Resolves to the failure reason, or null when the document was saved.
  onSaveTab: (tabId: string) => Promise<string | null>;
  onGoToTab: (tabId: string) => void;
  onStopBusy: (row: BusyRow) => void;
};

function titleFor(mode: DialogMode, count: number): string {
  if (mode === "close") return "Close workspace?";
  if (mode === "close-tab") return count === 1 ? "Close tab?" : "Close tabs?";
  return count === 1 ? "Hibernate tab?" : "Hibernate tabs?";
}

function confirmLabel(mode: DialogMode, review: HibernateReview | null): string {
  if (mode === "close") return "Close workspace";
  if (mode === "close-tab") return "Close";
  return review && review.busy.length > 0 ? "Hibernate now" : "Hibernate";
}

export function HibernateDialog({ workspace, tabIds, groupLabel, mode = "hibernate", processes = [], onClose, onConfirm, onSaveTab, onGoToTab, onStopBusy }: Props) {
  const sessions = useAgentStore((s) => s.sessions);
  const commands = useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot);
  const scriptStates = useSyncExternalStore(subscribeToScriptRunning, getScriptRunningSnapshot);
  const globalActionList = usePreferencesStore((s) => s.actions);
  const review = useMemo(() => {
    if (!workspace) return null;
    const live = {
      agentOf: (id: string) => liveAgent(sessions[id]),
      scriptState: (id: string) => scriptStates.get(id),
      actionOf: (id: string) => scriptActionOf(id, [workspace.actions ?? [], globalActionList]),
    };
    const found = processMap(processes);
    if (mode === "close") return hibernateReview(workspace, live, found);
    const wanted = new Set(tabIds);
    return tabsReview(
      allPanes(workspace.paneTree).flatMap((p) => p.tabs).filter((t) => wanted.has(t.id)),
      live,
      found,
    );
  }, [workspace, tabIds, mode, processes, sessions, scriptStates, globalActionList]);

  const closing = mode !== "hibernate";
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [discarded, setDiscarded] = useState<ReadonlySet<string>>(new Set());
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const workspaceId = workspace?.id;
  // Joined, because the caller may hand a new array on every render.
  const tabsKey = tabIds?.join(",");
  useEffect(() => {
    setFailures({});
    setDiscarded(new Set());
    setDontAskAgain(false);
  }, [workspaceId, tabsKey]);
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
  const agents = review?.busy.filter((b) => b.kind === "agent") ?? [];
  const scripts = review?.busy.filter((b) => b.kind === "script") ?? [];
  const running = review?.processes ?? [];
  const canSilence =
    review !== null &&
    canSilenceWarning(review) &&
    (scripts.length > 0 || running.length > 0) &&
    !(mode === "close" && deletedScripts > 0);
  const onlyAgentsPending =
    agents.length > 0 && scripts.length === 0 && review?.docs.length === 0 && running.length === 0;

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

  // Once everything the dialog warned about is resolved (the agents finished) there is nothing
  // left to ask, so it hibernates.
  useEffect(() => {
    if (mode === "hibernate" && workspace && review && isReviewEmpty(review)) onConfirm(false);
  }, [mode, workspace, review, onConfirm]);

  return (
    <AlertDialog open={workspace !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="grid-cols-[minmax(0,1fr)] data-[size=default]:sm:max-w-2xl">
        <AlertDialogHeader className="grid-cols-[minmax(0,1fr)]">
          <AlertDialogTitle className="flex items-center gap-2">
            {titleFor(mode, tabIds?.length ?? 0)}
          </AlertDialogTitle>
          <div className="flex w-full min-w-0 items-center gap-2 text-sm font-medium">
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
              {closing ? "Agents that are working and will be killed" : "Waiting for these agents to finish"}
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
                  {!closing && (
                    <Button
                      size="sm"
                      variant="outline"
                      title="Interrupt this agent so it can hibernate now"
                      onClick={() => onStopBusy(b)}
                    >
                      Kill
                    </Button>
                  )}
                </span>
                {tabs.get(b.tabId) && <RestoreFor tab={tabs.get(b.tabId)!} />}
              </div>
            ))}
            </div>
            {closing ? (
              <p className="text-[12px] text-muted-foreground">
                Consider waiting for {agents.length === 1 ? "the agent" : "the agents"} to finish before closing.
              </p>
            ) : (
              onlyAgentsPending && (
                <p className="text-[12px] text-muted-foreground">
                  {tabIds && tabIds.length === 1 ? "The tab" : "The tabs"} will hibernate as soon as the agents are done.
                </p>
              )
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
                {tabs.get(b.tabId) && <RestoreFor tab={tabs.get(b.tabId)!} />}
              </div>
            ))}
            </div>
          </section>
        )}
        {running.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Running processes that will be killed</h3>
            <div className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
              {running.map((p) => {
                const tab = tabs.get(p.tabId);
                return tab ? (
                  <div key={p.tabId} className="contents">
                    <TabLabel tab={tab} command={p.command} />
                    <RestoreFor tab={tab} />
                  </div>
                ) : (
                  <CommandOnly key={p.tabId} command={p.command} />
                );
              })}
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
                      <Button size="sm" variant="outline" className="shrink-0" title="Save this document" onClick={() => void saveDocs([d.tabId])}>
                        Save
                      </Button>
                    )}
                  </div>
                  {failure !== undefined && !isDiscarded && (
                    <p className="text-[12px] text-destructive">Could not save: {failure}</p>
                  )}
                </div>
              );
            })}
            {review.docs.length > 2 && (
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
        {mode === "close" && deletedScripts > 0 && (
          <p className="text-[12px] text-muted-foreground">
            {deletedScripts === 1 ? "1 action" : `${deletedScripts} actions`} will be deleted.
          </p>
        )}
        {canSilence && (
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox checked={dontAskAgain} onCheckedChange={(v) => setDontAskAgain(v === true)} />
            Don't ask me again
          </label>
        )}
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(canSilence && dontAskAgain)} autoFocus disabled={blockedByFailure}>
            {confirmLabel(mode, review)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
