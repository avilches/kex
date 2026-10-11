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
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  getRunningCommandsSnapshot,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { hibernateReview, isReviewEmpty, liveAgent } from "@/modules/workspaces/lib/hibernateReview";
import { WorkspaceMark } from "@/modules/workspaces/WorkspaceMark";
import type { Workspace } from "@/modules/workspaces/lib/types";

type Props = {
  workspace: Workspace | null;
  groupLabel?: string;
  onClose: () => void;
  onHibernate: () => void;
  onSaveTab: (tabId: string) => Promise<void>;
  onSaveAll: (tabIds: string[]) => Promise<void>;
  onEnableRunOnStart: (tabId: string, runningCommand?: string) => void;
  onKillAgent: (tabId: string) => void;
};

export function HibernateDialog({ workspace, groupLabel, onClose, onHibernate, onSaveTab, onSaveAll, onEnableRunOnStart, onKillAgent }: Props) {
  const sessions = useAgentStore((s) => s.sessions);
  const commands = useSyncExternalStore(subscribeToRunningCommands, getRunningCommandsSnapshot);
  const review = useMemo(
    () =>
      workspace
        ? hibernateReview(workspace, {
            agentOf: (id) => liveAgent(sessions[id]),
            runningCommand: (id) => commands.get(id),
          })
        : null,
    [workspace, sessions, commands],
  );

  // Radix keeps the content mounted during the exit animation, after `workspace` is already null.
  const shown = useRef<{ workspace: Workspace; groupLabel?: string } | null>(null);
  if (workspace) shown.current = { workspace, groupLabel };
  const titleWs = shown.current?.workspace;
  const titleGroup = shown.current?.groupLabel;

  // The dialog only opens when something is pending: once everything is
  // resolved there is nothing left to warn about, so it closes and hibernates.
  useEffect(() => {
    if (workspace && review && isReviewEmpty(review)) onHibernate();
  }, [workspace, review, onHibernate]);

  return (
    <AlertDialog open={workspace !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="grid-cols-[minmax(0,1fr)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {titleWs && (
              <WorkspaceMark id={titleWs.id} color={titleWs.color} icon={titleWs.icon} size={18} />
            )}
            <span className="truncate">
              {titleWs?.title ? `Hibernate "${titleWs.title}"?` : "Hibernate this workspace?"}
            </span>
            {titleGroup && (
              <span className="max-w-[40%] shrink-0 truncate text-[12px] font-normal text-muted-foreground">
                {titleGroup}
              </span>
            )}
          </AlertDialogTitle>
        </AlertDialogHeader>
        {review && review.agents.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Waiting for these agents to finish</h3>
            {review.agents.map((a) => (
              <div key={a.tabId} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                  <AgentIcon agent={a.agent} size={12} className="shrink-0" />
                  <span className="truncate">{a.title ?? a.agent}</span>
                  <span className="size-[8px] shrink-0 animate-spin rounded-full border border-transparent border-t-foreground/70" />
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  title="Interrupt this agent so the workspace can hibernate now"
                  onClick={() => onKillAgent(a.tabId)}
                >
                  Kill
                </Button>
              </div>
            ))}
            {review.docs.length === 0 && review.commands.length === 0 && (
              <p className="text-[12px] text-muted-foreground">
                The workspace will hibernate as soon as they are done.
              </p>
            )}
          </section>
        )}
        {review && review.docs.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Unsaved documents</h3>
            {review.docs.map((d) => (
              <div key={d.tabId} className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-muted-foreground" title={d.path}>
                  {pathBasename(d.path)}
                </span>
                <Button size="sm" variant="outline" className="shrink-0" title="Save this document" onClick={() => void onSaveTab(d.tabId)}>
                  Save
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              className="self-end"
              title="Save every unsaved document"
              onClick={() => void onSaveAll(review.docs.map((d) => d.tabId))}
            >
              Save all
            </Button>
          </section>
        )}
        {review && review.commands.length > 0 && (
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
            Close
          </Button>
          <Button onClick={onHibernate} autoFocus>
            {review && review.agents.length > 0 ? "Hibernate now" : "Hibernate anyway"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
