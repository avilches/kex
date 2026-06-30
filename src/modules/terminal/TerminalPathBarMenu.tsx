import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Copy01Icon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  NoteEditIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { native } from "@/lib/native";
import { copyToClipboard, revealInFinder, REVEAL_LABEL } from "@/modules/explorer/lib/contextActions";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getShortcutLabel } from "@/modules/shortcuts/shortcuts";
import type { AgentSession } from "@/modules/agents/lib/types";
import type { Tab } from "@/modules/workspaces/lib/types";
import { leafScratchpadOpen, toggleScratchpad } from "./lib/useTerminalSession";

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

type Props = {
  leafId: string;
  restoreOnRestart?: boolean;
  persistentCommand?: string;
  onUpdatePanel: (updater: (p: Tab) => Tab) => void;
  agentSession: AgentSession | null;
  runningCommand: string | null;
};

export function TerminalPathBarMenu({
  leafId,
  restoreOnRestart,
  persistentCommand,
  onUpdatePanel,
  agentSession,
  runningCommand,
}: Props) {
  const [open, setOpen] = useState(false);
  const [scratchpadOn, setScratchpadOn] = useState(false);
  const scratchpadKey = usePreferencesStore((s) =>
    getShortcutLabel("terminal.scratchpad", s.shortcuts),
  );
  useEffect(() => {
    if (open) setScratchpadOn(leafScratchpadOpen(leafId));
  }, [open, leafId]);
  const [transcriptExists, setTranscriptExists] = useState<boolean | null>(null);
  const transcriptPath = agentSession?.meta?.transcriptPath;

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

  const sessionId = agentSession?.meta?.sessionId;
  // Agents default to restore=true; plain terminals default to false.
  const checked = agentSession ? restoreOnRestart !== false : (restoreOnRestart ?? false);

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
      <DropdownMenuContent align="end" className="w-56 text-[12px]">
        <DropdownMenuCheckboxItem
          checked={scratchpadOn}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={() => {
            toggleScratchpad(leafId);
            setScratchpadOn((v) => !v);
          }}
        >
          <HugeiconsIcon icon={NoteEditIcon} className="size-3.5" strokeWidth={2} />
          <span>Scratchpad</span>
          {scratchpadKey && (
            <DropdownMenuShortcut>{scratchpadKey}</DropdownMenuShortcut>
          )}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={checked}
          onSelect={(e) => e.preventDefault()}
          onCheckedChange={(next) => {
            onUpdatePanel((p) => ({
              ...p,
              restoreOnRestart: next,
              persistentCommand: next
                ? (persistentCommand ?? runningCommand ?? undefined)
                : persistentCommand,
            }));
          }}
        >
          <HugeiconsIcon icon={PlayIcon} className="size-3.5" strokeWidth={2} />
          <span>Run on start</span>
        </DropdownMenuCheckboxItem>
        {checked && (
          <div className="px-2 py-1">
            <input
              type="text"
              placeholder="command to run (e.g. lazygit)"
              defaultValue={persistentCommand ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                onUpdatePanel((p) => ({ ...p, persistentCommand: v || undefined }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                e.stopPropagation();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="h-6 w-full rounded border border-border/60 bg-background px-1.5 text-[11px] text-foreground outline-none focus:border-primary"
            />
          </div>
        )}
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
                    <button
                      type="button"
                      title="Copy session id"
                      onClick={() => void copyToClipboard(sessionId)}
                      className="flex size-[20px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={1.9} />
                    </button>
                  </span>
                </div>
              )}
              {transcriptPath && (
                <div className="flex items-center justify-between gap-1">
                  <span className="shrink-0 text-muted-foreground">Transcript</span>
                  <span className="flex min-w-0 items-center gap-1">
                    {transcriptExists === false ? (
                      <span className="italic text-muted-foreground">not created yet</span>
                    ) : (
                      <span className="max-w-[120px] truncate font-mono text-foreground">
                        {transcriptPath.split(/[\\/]/).pop()}
                      </span>
                    )}
                    <button
                      type="button"
                      title={REVEAL_LABEL}
                      disabled={transcriptExists === false}
                      onClick={() => {
                        if (transcriptExists !== false) void revealInFinder(transcriptPath);
                      }}
                      className="flex size-[20px] shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <HugeiconsIcon icon={FolderOpenIcon} size={12} strokeWidth={1.9} />
                    </button>
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
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
