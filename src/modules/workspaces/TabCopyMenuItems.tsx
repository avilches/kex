import { useEffect, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  FolderOpenIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { revealInFinder } from "@/modules/explorer/lib/contextActions";
import { writeClipboardText } from "@/lib/clipboard";
import { native } from "@/lib/native";
import { IS_MAC } from "@/lib/platform";
import { useSidebarTabMenu } from "./SidebarTabMenuContext";
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
  disabled,
  onSelect,
}: {
  icon: typeof Copy01Icon;
  label: ReactNode;
  value: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenuItem disabled={disabled} onSelect={onSelect}>
      <HugeiconsIcon icon={icon} size={14} strokeWidth={2} />
      <span className="min-w-0">
        {label}
        <ValueHint value={value} />
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

export function TabCopyMenuItems({ tabId }: { tabId: string }) {
  const meta = useAgentStore((s) => s.sessions[tabId]?.meta);
  const { onRevealInExplorer } = useSidebarTabMenu();
  const sessionId = meta?.sessionId;
  const transcriptPath = meta?.transcriptPath;
  const transcriptExists = useFileExists(transcriptPath);
  const copy = (value: string) => () => void writeClipboardText(value);

  return (
    <>
      <ValueItem icon={Copy01Icon} label="Copy Tab ID" value={tabId} onSelect={copy(tabId)} />
      {sessionId && (
        <ValueItem
          icon={Copy01Icon}
          label="Copy Session ID"
          value={sessionId}
          onSelect={copy(sessionId)}
        />
      )}
      {transcriptPath && (
        <>
          <ValueItem
            icon={FolderOpenIcon}
            label="Open Transcript Folder"
            value={parentDir(transcriptPath)}
            disabled={transcriptExists === false}
            onSelect={() => onRevealInExplorer(parentDir(transcriptPath))}
          />
          <ValueItem
            icon={Search01Icon}
            label={REVEAL_TRANSCRIPT_LABEL}
            value={transcriptPath}
            disabled={transcriptExists === false}
            onSelect={() => void revealInFinder(transcriptPath)}
          />
        </>
      )}
    </>
  );
}
