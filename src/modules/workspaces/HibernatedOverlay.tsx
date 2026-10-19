import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { previewResumeCmd } from "@/modules/agents/lib/agentSessionRestore";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
import { useDroppable } from "@dnd-kit/core";
import { SleepingIcon, UploadCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatHibernatedFor, restoreCommandFor } from "./lib/hibernate";
import {
  markHibernateFxPlayed,
  shouldPlayHibernateFx,
} from "./lib/hibernateFx";
import { allPanes, focusedTab } from "./lib/splitNode";
import { HIBERNATED_DROP_PREFIX } from "./lib/tabDrop";
import { tabIcon } from "./lib/tabTitle";
import type { Tab, TabHibernation, Workspace } from "./lib/types";
import { useAgentTabTitle } from "./lib/useAgentTabTitle";
import { useWorkspaceTitle } from "./lib/workspaceTitle";
import { useWorkspaceDnd } from "./WorkspaceDndProvider";
import { WorkspaceMark } from "./WorkspaceMark";

type Props = { workspace: Workspace; onWake: () => void; active: boolean };

const TICK_MS = 30_000;

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

// A workspace hibernated at startup has no snapshot: the agent and resume command come from
// the same plan the wake uses.
function useSleepingSnapshot(tab: Tab): TabHibernation | undefined {
  const saved = tab.kind === "terminal" ? tab.hibernation : undefined;
  const [fetched, setFetched] = useState<TabHibernation>();
  // The IPC keys only on the tab id; every other use of the tab body is read
  // through the ref when the plan lands, so a fresh tab object with the same
  // id (a title refresh, say) does not relaunch the preview.
  const tabId = tab.kind === "terminal" ? tab.id : null;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    if (!tabId || saved) return;
    let cancelled = false;
    void previewResumeCmd(tabId).then((plan) => {
      if (cancelled) return;
      const current = tabRef.current;
      setFetched({
        agent: plan?.agent,
        command:
          current.kind === "terminal"
            ? restoreCommandFor(current, plan)
            : undefined,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [tabId, saved]);
  return saved ?? fetched;
}

function SleepingTabRow({ tab }: { tab: Tab }) {
  const info = useAgentTabTitle(tab);
  const snapshot = useSleepingSnapshot(tab);
  const title =
    snapshot?.title ||
    (tab.title && info?.displayTitle) ||
    (tab.kind === "terminal" ? tab.agentTitle : undefined) ||
    info?.displayTitle ||
    tab.id;
  const agent = snapshot?.agent;
  const command = snapshot?.command;
  return (
    <li className="contents text-[12px]">
      <span
        title={title}
        className="flex h-6 min-w-0 items-center gap-1.5 pl-2"
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          {agent && !tab.icon ? (
            <AgentIcon agent={agent} size={12} />
          ) : (
            tabIcon(tab)
          )}
        </span>
        <span className="min-w-0 truncate">{title}</span>
      </span>
      <span title={command} className="flex h-6 min-w-0 items-center pr-2">
        <span className="truncate font-mono text-[11px] opacity-70">
          {command}
        </span>
      </span>
    </li>
  );
}

export function HibernatedOverlay({ workspace, onWake, active }: Props) {
  const workspaceId = workspace.id;
  const shownTitle = useWorkspaceTitle({
    id: workspace.id,
    title: workspace.title,
    cwd: workspace.cwd,
    workspaceRoot: workspace.workspaceRoot,
    focusedTab: focusedTab(workspace.paneTree, workspace.activePaneId),
  });
  const dragging = useWorkspaceDnd().draggingItem;
  const acceptsDrop =
    active && dragging?.kind === "tab" && dragging.workspaceId !== workspaceId;
  const { setNodeRef, isOver } = useDroppable({
    id: `${HIBERNATED_DROP_PREFIX}${workspaceId}`,
    disabled: !acceptsDrop,
  });
  const shortcutLabel = useShortcutLabel("workspace.hibernate");
  const tabs = useMemo(
    () => allPanes(workspace.paneTree).flatMap((p) => p.tabs),
    [workspace.paneTree],
  );
  const now = useNow(active && workspace.hibernatedAt !== undefined);
  const [fx] = useState(() =>
    shouldPlayHibernateFx(workspaceId, workspace.hibernatedAt),
  );
  useEffect(
    () => markHibernateFxPlayed(workspaceId, workspace.hibernatedAt),
    [workspaceId, workspace.hibernatedAt],
  );
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-background text-muted-foreground",
        acceptsDrop && isOver && "ring-2 ring-inset ring-primary/60",
        fx && "overflow-hidden",
      )}
    >
      <HugeiconsIcon
        icon={SleepingIcon}
        size={112}
        strokeWidth={1}
        className={cn("opacity-70", fx && "hib-ov-icon")}
      />
      <div
        className={cn(
          "flex max-w-[80%] flex-col items-center gap-1.5",
          fx && "hib-item [animation-delay:350ms]",
        )}
      >
        <span className="flex items-center gap-2 text-[15px] text-foreground">
          <WorkspaceMark
            id={workspaceId}
            color={workspace.color}
            icon={workspace.icon}
            size={22}
          />
          <span className="truncate">{shownTitle || "Workspace"}</span>
        </span>
        {workspace.hibernatedAt !== undefined && (
          <span className="text-[12px]">
            Hibernated for {formatHibernatedFor(now - workspace.hibernatedAt)}
          </span>
        )}
      </div>
      {tabs.length > 0 && (
        <ul
          className={cn(
            "grid max-h-[40%] w-max min-w-96 max-w-[80%] grid-cols-[minmax(0,max-content)_minmax(0,1fr)] content-start gap-x-3 gap-y-px overflow-y-auto border-l border-border/60 pl-0.5",
            fx && "hib-item [animation-delay:500ms]",
          )}
        >
          {tabs.map((tab) => (
            <SleepingTabRow key={tab.id} tab={tab} />
          ))}
        </ul>
      )}
      <Button
        size="lg"
        onClick={onWake}
        autoFocus={active}
        className={cn("gap-2", fx && "hib-item [animation-delay:650ms]")}
      >
        <HugeiconsIcon icon={UploadCircle01Icon} size={16} strokeWidth={2} />
        Restore
        {shortcutLabel && (
          <span className="text-[11px] font-normal opacity-70">
            {shortcutLabel}
          </span>
        )}
      </Button>
      {fx && <span aria-hidden className="hib-wash hib-wash-in" />}
    </div>
  );
}
