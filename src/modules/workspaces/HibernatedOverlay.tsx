import { useDroppable } from "@dnd-kit/core";
import { SleepingIcon, UploadCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { formatHibernatedFor } from "./lib/hibernate";
import { allPanes } from "./lib/splitNode";
import { tabIcon } from "./lib/tabTitle";
import { useAgentTabTitle } from "./lib/useAgentTabTitle";
import { HIBERNATED_DROP_PREFIX } from "./lib/tabDrop";
import type { Tab, Workspace } from "./lib/types";
import { useWorkspaceDnd } from "./WorkspaceDndProvider";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
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

function SleepingTabRow({ tab }: { tab: Tab }) {
  const info = useAgentTabTitle(tab);
  const title = info?.displayTitle ?? tab.id;
  const agent = info?.hasAgent ? info.agentSession?.agent : undefined;
  return (
    <li title={title} className="flex h-6 items-center gap-1.5 px-2 text-[12px]">
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {agent ? <AgentIcon agent={agent} size={12} /> : tabIcon(tab)}
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </li>
  );
}

export function HibernatedOverlay({ workspace, onWake, active }: Props) {
  const workspaceId = workspace.id;
  const dragging = useWorkspaceDnd().draggingItem;
  const acceptsDrop = active && dragging?.kind === "tab" && dragging.workspaceId !== workspaceId;
  const { setNodeRef, isOver } = useDroppable({
    id: `${HIBERNATED_DROP_PREFIX}${workspaceId}`,
    disabled: !acceptsDrop,
  });
  const shortcutLabel = useShortcutLabel("workspace.hibernate");
  const tabs = useMemo(() => allPanes(workspace.paneTree).flatMap((p) => p.tabs), [workspace.paneTree]);
  const now = useNow(active && workspace.hibernatedAt !== undefined);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-background text-muted-foreground",
        acceptsDrop && isOver && "ring-2 ring-inset ring-primary/60",
      )}
    >
      <HugeiconsIcon icon={SleepingIcon} size={112} strokeWidth={1} className="opacity-70" />
      <div className="flex max-w-[80%] flex-col items-center gap-1.5">
        <span className="flex items-center gap-2 text-[15px] text-foreground">
          <WorkspaceMark id={workspaceId} color={workspace.color} icon={workspace.icon} size={22} />
          <span className="truncate">{workspace.title || "Workspace"}</span>
        </span>
        {workspace.hibernatedAt !== undefined && (
          <span className="text-[12px]">
            Hibernated for {formatHibernatedFor(now - workspace.hibernatedAt)}
          </span>
        )}
      </div>
      {tabs.length > 0 && (
        <ul className="flex max-h-[40%] w-64 max-w-[80%] flex-col gap-px overflow-y-auto border-l border-border/60 pl-0.5">
          {tabs.map((tab) => (
            <SleepingTabRow key={tab.id} tab={tab} />
          ))}
        </ul>
      )}
      <Button size="lg" onClick={onWake} autoFocus={active} className="gap-2">
        <HugeiconsIcon icon={UploadCircle01Icon} size={16} strokeWidth={2} />
        Restore
        {shortcutLabel && <span className="text-[11px] font-normal opacity-70">{shortcutLabel}</span>}
      </Button>
    </div>
  );
}
