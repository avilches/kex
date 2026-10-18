import { useEffect, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  FolderOpenIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { revealInFinder } from "@/modules/explorer/lib/contextActions";
import { writeClipboardText } from "@/lib/clipboard";
import { native } from "@/lib/native";
import { IS_MAC } from "@/lib/platform";
import { useSidebarTabMenu } from "./SidebarTabMenuContext";
import { showsAgentMenu } from "./lib/agentMenu";
import { parentDir } from "./lib/transcriptPath";

const REVEAL_TRANSCRIPT_LABEL = IS_MAC
  ? "Reveal Transcript in Finder"
  : "Reveal Transcript in File Manager";

function ValueHint({ value }: { value: string }) {
  return (
    <span className="block max-w-[240px] truncate font-mono text-[10px] font-normal text-muted-foreground">
      {value}
    </span>
  );
}

function ValueItem({
  icon,
  label,
  value,
  onSelect,
}: {
  icon: typeof Copy01Icon;
  label: ReactNode;
  value?: string;
  onSelect: () => void;
}) {
  return (
    <ContextMenuItem onSelect={onSelect}>
      <HugeiconsIcon icon={icon} size={14} strokeWidth={2} />
      <span className="min-w-0">
        {label}
        {value !== undefined && <ValueHint value={value} />}
      </span>
    </ContextMenuItem>
  );
}

// The menu content only mounts while the menu is open, so the stat runs once
// per opening and never for closed tabs.
function useFileExists(path: string | undefined): boolean | null {
  const [exists, setExists] = useState<boolean | null>(null);
  useEffect(() => {
    setExists(null);
    if (!path) return;
    let cancelled = false;
    native
      .fsStat(path)
      .then(() => { if (!cancelled) setExists(true); })
      .catch(() => { if (!cancelled) setExists(false); });
    return () => { cancelled = true; };
  }, [path]);
  return exists;
}

export function CopyTabIdItem({ tabId }: { tabId: string }) {
  return (
    <ValueItem
      icon={Copy01Icon}
      label="Copy Tab ID"
      value={tabId}
      onSelect={() => void writeClipboardText(tabId)}
    />
  );
}

function agentTitle(agent: string): string {
  return agent.charAt(0).toUpperCase() + agent.slice(1);
}

// The agent block of the tab menu. `children` render inside it, after the session actions:
// Run on Start belongs to the agent, so it sits with it instead of with the generic tab items.
export function TabAgentMenuItems({
  tabId,
  children,
}: {
  tabId: string;
  children?: ReactNode;
}) {
  const session = useAgentStore((s) => s.sessions[tabId]);
  const { onRevealInExplorer } = useSidebarTabMenu();
  const meta = session?.meta;
  const transcriptPath = meta?.transcriptPath;
  const transcriptExists = useFileExists(transcriptPath);
  if (!session || !showsAgentMenu(session)) {
    return children ? (
      <>
        {children}
        <ContextMenuSeparator />
      </>
    ) : null;
  }
  const sessionId = meta?.sessionId;
  const hasTranscript = !!transcriptPath && transcriptExists !== false;

  return (
    <>
      <ContextMenuLabel className="flex items-center gap-2 px-2 py-1.5">
        <AgentIcon agent={session.agent} size={14} />
        <span className="min-w-0">
          <span className="block font-medium text-foreground">{agentTitle(session.agent)}</span>
          {meta?.model && (
            <span className="block truncate font-mono text-[10px] font-normal">{meta.model}</span>
          )}
        </span>
      </ContextMenuLabel>
      {sessionId && (
        <ValueItem
          icon={Copy01Icon}
          label="Copy Session ID"
          value={sessionId}
          onSelect={() => void writeClipboardText(sessionId)}
        />
      )}
      {hasTranscript ? (
        <>
          <ValueItem
            icon={FolderOpenIcon}
            label="Open Transcript Folder"
            onSelect={() => onRevealInExplorer(parentDir(transcriptPath))}
          />
          <ValueItem
            icon={Search01Icon}
            label={REVEAL_TRANSCRIPT_LABEL}
            onSelect={() => void revealInFinder(transcriptPath)}
          />
        </>
      ) : (
        <ContextMenuItem disabled>
          <HugeiconsIcon icon={FolderOpenIcon} size={14} strokeWidth={2} />
          Transcript not created yet
        </ContextMenuItem>
      )}
      {children}
      <ContextMenuSeparator />
    </>
  );
}
