import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  Loading03Icon,
  Notification01Icon,
  Notification03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getSnapshot as getOscTitlesSnapshot,
  subscribe as subscribeOscTitles,
} from "@/modules/terminal/lib/oscTitleStore";
import { setAgentNotifications } from "@/modules/settings/store";
import { type AgentEntry, buildAgentEntries } from "../lib/notificationList";
import { useAgentStore } from "../store/agentStore";
import { useBellStore } from "../store/bellStore";

type Props = {
  onActivate: (workspaceId: string, tabId: string) => void;
};

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function EntryDot({ visual }: { visual: AgentEntry["visual"] }) {
  // Mirrors the tab indicators in PaneTabBar so the bell stays visually in sync.
  if (visual === "working") {
    return (
      <span className="size-[8px] shrink-0 animate-spin rounded-full border border-transparent border-t-foreground/70" />
    );
  }
  if (visual === "error") {
    return <span className="size-[6px] shrink-0 rounded-full bg-destructive" />;
  }
  return <span className="size-[6px] shrink-0 rounded-full bg-amber-400" />;
}

function AgentEntryRow({
  entry,
  name,
  onClick,
}: {
  entry: AgentEntry;
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
    >
      <span className="flex w-4 shrink-0 items-center justify-center">
        <EntryDot visual={entry.visual} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {name}
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {relativeTime(entry.at)}
      </span>
    </button>
  );
}

export function NotificationBell({ onActivate }: Props) {
  const open = useBellStore((s) => s.open);
  const setOpen = useBellStore((s) => s.setOpen);
  const [hooksReady, setHooksReady] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const sessions = useAgentStore((s) => s.sessions);
  const notifications = useAgentStore((s) => s.notifications);
  const markAllRead = useAgentStore((s) => s.markAllRead);
  const clearAll = useAgentStore((s) => s.clearAll);
  const oscTitles = useSyncExternalStore(
    subscribeOscTitles,
    getOscTitlesSnapshot,
  );

  const entries = useMemo(
    () => buildAgentEntries(sessions, notifications),
    [sessions, notifications],
  );
  const activeCount = entries.filter(
    (e) => e.visual === "waiting" || e.visual === "working",
  ).length;
  // One entry per agent, so each pending entry counts once (no double-counting).
  const badge = entries.filter((e) => e.pending).length;

  const refreshHooks = useCallback(() => {
    invoke<boolean>("agent_claude_hooks_status")
      .then(setHooksReady)
      .catch(() => setHooksReady(null));
  }, []);

  useEffect(() => {
    refreshHooks();
  }, [refreshHooks]);

  // Opening (by click or by the global shortcut) marks notifications read and
  // re-checks the hooks status.
  useEffect(() => {
    if (open) {
      markAllRead();
      refreshHooks();
    }
  }, [open, markAllRead, refreshHooks]);

  const enableClaudeHooks = async () => {
    setInstalling(true);
    try {
      await invoke("agent_enable_claude_hooks");
      await setAgentNotifications(true);
      setHooksReady(true);
    } catch (e) {
      console.error("[kex] agent_enable_claude_hooks failed:", e);
      setHooksReady(false);
    } finally {
      setInstalling(false);
    }
  };

  const activate = (workspaceId: string, tabId: string) => {
    onActivate(workspaceId, tabId);
    setOpen(false);
  };

  const empty = entries.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Agent notifications"
        >
          <HugeiconsIcon
            icon={Notification01Icon}
            size={16}
            strokeWidth={1.75}
          />
          {badge > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[9px] font-semibold leading-none text-white">
              {badge > 9 ? "9+" : badge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 overflow-hidden p-0 gap-0.5"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex h-10 items-center px-3 pt-0.5">
          <span className="flex gap-1 text-[13px] text-foreground">
            Notifications
          </span>
          {activeCount > 0 ? (
            <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {activeCount} active
            </span>
          ) : null}
        </div>

        {empty ? (
          <div className="border-t border-border/60 px-3 py-5 text-center text-xs text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto border-t border-border/60 p-1">
            {entries.map((entry) => (
              <AgentEntryRow
                key={entry.tabId}
                entry={entry}
                name={oscTitles.get(entry.tabId) ?? entry.agent}
                onClick={() => activate(entry.workspaceId, entry.tabId)}
              />
            ))}
          </div>
        )}

        {!empty ? (
          <div className="border-t border-border/60 p-1">
            <button
              type="button"
              onClick={clearAll}
              className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.75} />
              Clear all
            </button>
          </div>
        ) : null}

        {!hooksReady ? (
          <div className="border-t border-border/60 p-1">
            <button
              type="button"
              onClick={enableClaudeHooks}
              disabled={installing}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
            >
              <HugeiconsIcon
                icon={installing ? Loading03Icon : Notification03Icon}
                size={14}
                strokeWidth={1.75}
                className={cn(installing && "animate-spin")}
              />
              <span className="text-left">
                <span className="block font-medium">
                  {installing
                    ? "Installing hooks..."
                    : "Install Claude Code hooks for Kex"}
                </span>
                <span className="block text-[11px]">
                  Session restore on close · Tab notifications
                </span>
              </span>
            </button>
            {hooksReady === false && !installing ? (
              <p className="px-2 pt-1 text-[11px] text-destructive">
                Could not update Claude Code config.
              </p>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
