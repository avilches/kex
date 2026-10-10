import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { AgentEntry } from "@/modules/agents/lib/notificationList";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { useAgentTabTitle } from "@/modules/workspaces/lib/useAgentTabTitle";
import type { Tab } from "@/modules/workspaces/lib/types";
import {
  type DetailRow,
  type WorkspaceDetailMode,
  workspaceDetailRows,
} from "@/modules/workspaces/lib/workspaceDetail";

function StatusMark({ visual }: { visual: DetailRow["visual"] }) {
  if (visual === "working") {
    return (
      <span className="size-[8px] shrink-0 animate-spin rounded-full border border-transparent border-t-current opacity-70" />
    );
  }
  if (visual === null) return null;
  return (
    <span
      className={cn(
        "size-[6px] shrink-0 rounded-full",
        visual === "error" ? "bg-destructive" : "bg-amber-400",
      )}
    />
  );
}

function DetailTabRow({
  tab,
  visual,
  onActivate,
}: {
  tab: Tab;
  visual: DetailRow["visual"];
  onActivate: (tabId: string) => void;
}) {
  const info = useAgentTabTitle(tab);
  const title = info?.displayTitle ?? tab.id;
  return (
    <button
      type="button"
      title={title}
      onClick={() => onActivate(tab.id)}
      className="flex h-6 w-full items-center gap-1.5 rounded-md pl-2 pr-1.5 text-left text-[11.5px] text-muted-foreground transition-colors select-none hover:bg-foreground/[0.08] hover:text-foreground"
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <StatusMark visual={visual} />
    </button>
  );
}

export const WorkspaceDetailList = memo(function WorkspaceDetailList({
  tabs,
  entries,
  mode,
  onActivate,
}: {
  tabs: Tab[];
  entries: AgentEntry[] | undefined;
  mode: WorkspaceDetailMode;
  onActivate: (tabId: string) => void;
}) {
  const sessions = useAgentStore((s) => s.sessions);
  const rows = useMemo(() => {
    const agentTabIds = new Set(
      tabs.filter((t) => t.kind === "terminal" && sessions[t.id]).map((t) => t.id),
    );
    return workspaceDetailRows(tabs, agentTabIds, entries ?? [], mode);
  }, [tabs, sessions, entries, mode]);
  const tabsById = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);

  if (rows.length === 0) return null;

  return (
    <div className="ml-6 mt-0.5 flex flex-col gap-px border-l border-border/60 pl-0.5">
      {rows.map((row) => {
        const tab = tabsById.get(row.tabId);
        return tab ? (
          <DetailTabRow
            key={row.tabId}
            tab={tab}
            visual={row.visual}
            onActivate={onActivate}
          />
        ) : null;
      })}
    </div>
  );
});
