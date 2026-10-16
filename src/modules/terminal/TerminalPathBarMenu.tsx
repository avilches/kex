import { useState, useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Cancel01Icon,
  Copy01Icon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { writeClipboardText } from "@/lib/clipboard";
import { native } from "@/lib/native";
import { IS_MAC } from "@/lib/platform";
import { revealInFinder } from "@/modules/explorer/lib/contextActions";
import type { AgentSession } from "@/modules/agents/lib/types";

const REVEAL_TRANSCRIPT_LABEL = IS_MAC
  ? "Reveal Transcript in Finder"
  : "Reveal Transcript in File Manager";

function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : path;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function CopyIdButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await writeClipboardText(value);
    setState(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1500);
  };

  return (
    <button
      type="button"
      title={state === "copied" ? "Copied!" : state === "failed" ? "Copy failed" : `Copy ${label}`}
      onClick={() => void copy()}
      className={`flex size-[20px] shrink-0 items-center justify-center rounded transition-colors ${
        state === "copied"
          ? "text-primary"
          : state === "failed"
            ? "text-destructive"
            : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <HugeiconsIcon
        icon={state === "copied" ? Tick02Icon : state === "failed" ? Cancel01Icon : Copy01Icon}
        size={12}
        strokeWidth={1.9}
      />
    </button>
  );
}

type Props = {
  tabId: string;
  agentSession: AgentSession | null;
  onReveal?: (path: string) => void;
};

export function TerminalPathBarMenu({
  tabId,
  agentSession,
  onReveal,
}: Props) {
  const [open, setOpen] = useState(false);
  const [transcriptExists, setTranscriptExists] = useState<boolean | null>(null);
  const transcriptPath = agentSession?.meta?.transcriptPath;
  const sessionId = agentSession?.meta?.sessionId;

  // Only fsStat when the menu is open to avoid IPC overhead on every render.
  useEffect(() => {
    if (!open || !transcriptPath) {
      setTranscriptExists(null);
      return;
    }
    let cancelled = false;
    setTranscriptExists(null);
    native
      .fsStat(transcriptPath)
      .then(() => { if (!cancelled) setTranscriptExists(true); })
      .catch(() => { if (!cancelled) setTranscriptExists(false); });
    return () => { cancelled = true; };
  }, [open, transcriptPath]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Terminal options"
          className="flex size-[22px] items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 text-[12px]">
        <div className="flex items-center justify-between gap-1 px-2 py-1 text-[11px]">
          <span className="shrink-0 text-muted-foreground">Tab id</span>
          <span className="flex min-w-0 items-center gap-1">
            <span className="max-w-[140px] truncate font-mono text-foreground">{tabId}</span>
            <CopyIdButton value={tabId} label="tab id" />
          </span>
        </div>
        {agentSession && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">
              Agent session
            </DropdownMenuLabel>
            <div className="space-y-1 px-2 pb-1.5">
              {sessionId && (
                <div className="flex items-center justify-between gap-1">
                  <span className="shrink-0 text-muted-foreground">Session</span>
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="max-w-[120px] truncate font-mono text-foreground">{sessionId}</span>
                    <CopyIdButton value={sessionId} label="session id" />
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-1">
                <span className="shrink-0 text-muted-foreground">Started</span>
                <span className="text-foreground">{formatElapsed(Date.now() - agentSession.startedAt)} ago</span>
              </div>
              {agentSession.restoreError && (
                <div className="break-words text-[11px] text-destructive">
                  {agentSession.restoreErrorReason ?? "unknown error"}
                </div>
              )}
            </div>
            {transcriptPath && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={transcriptExists === false}
                  onSelect={() => onReveal?.(parentDir(transcriptPath))}
                  className="text-[12px]"
                >
                  <HugeiconsIcon icon={FolderOpenIcon} size={12} strokeWidth={1.9} />
                  Open Transcript Folder
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={transcriptExists === false}
                  onSelect={() => void revealInFinder(transcriptPath)}
                  className="text-[12px]"
                >
                  <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={1.9} />
                  {REVEAL_TRANSCRIPT_LABEL}
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
