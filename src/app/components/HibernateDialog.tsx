import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pathBasename } from "@/lib/pathUtils";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  getRunningCommandsSnapshot,
  subscribeToRunningCommands,
} from "@/modules/workspaces/lib/terminalEphemeralStore";
import { hibernateReview, isReviewEmpty, liveAgent } from "@/modules/workspaces/lib/hibernateReview";
import { resolveWorkspaceColor } from "@/modules/workspaces/lib/workspaceColor";
import type { Workspace } from "@/modules/workspaces/lib/types";

type Props = {
  workspace: Workspace | null;
  onClose: () => void;
  onHibernate: () => void;
  onSaveTab: (tabId: string) => Promise<void>;
  onSaveAll: (tabIds: string[]) => Promise<void>;
  onEnableRunOnStart: (tabId: string, runningCommand?: string) => void;
};

export function HibernateDialog({ workspace, onClose, onHibernate, onSaveTab, onSaveAll, onEnableRunOnStart }: Props) {
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

  const color = workspace ? resolveWorkspaceColor(workspace.color, workspace.id) : null;

  // The dialog only opens when something is pending: once everything is
  // resolved there is nothing left to warn about, so it closes and hibernates.
  useEffect(() => {
    if (workspace && review && isReviewEmpty(review)) onHibernate();
  }, [workspace, review, onHibernate]);

  return (
    <AlertDialog open={workspace !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-full"
              style={
                color !== null
                  ? { backgroundColor: color }
                  : { backgroundColor: "var(--muted)", boxShadow: "inset 0 0 0 1px var(--ring)" }
              }
            />
            <span className="truncate">
              {workspace?.title ? `Hibernate "${workspace.title}"?` : "Hibernate this workspace?"}
            </span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            Hibernating closes every terminal and editor. The items below cannot be recovered when you restore it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {review && review.agents.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[12px] font-medium">Agents working</h3>
            {review.agents.map((a) => (
              <p key={a.tabId} className="text-[12px] text-muted-foreground">
                {a.title ?? a.agent} is still working
              </p>
            ))}
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
                <Button size="sm" variant="outline" title="Save this document" onClick={() => void onSaveTab(d.tabId)}>
                  Save
                </Button>
              </div>
            ))}
            <Button
              size="sm"
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
            Hibernate anyway
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
