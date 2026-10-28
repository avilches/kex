import { Button } from "@/components/ui/button";
import { cachedHomeDir } from "@/lib/homeDir";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
import { SleepingIcon, UploadCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { HibernatedLines } from "./HibernatedLines";
import { formatHibernatedFor, type SleepingTab } from "./lib/hibernate";
import { tildePath } from "./lib/sessionPreview";
import { tabIcon } from "./lib/tabTitle";
import { useAgentTabTitle } from "./lib/useAgentTabTitle";

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

type Props = { tab: SleepingTab; visible: boolean; focused: boolean; onWake: () => void };

// What a hibernated terminal tab shows in place of its terminal: no PTY and no render slot sit
// behind it, only what was captured when it went to sleep.
export function HibernatedTab({ tab, visible, focused, onWake }: Props) {
  const info = useAgentTabTitle(tab);
  const shortcutLabel = useShortcutLabel("tab.wake");
  const now = useNow(visible);
  const { agent, command, title: frozen, at } = tab.hibernation;
  const title = frozen || info?.displayTitle || tab.title || tab.id;
  const folder = tab.hibernation.worktreeCwd || tab.cwd;
  return (
    <div
      data-hibernated-tab
      className="relative flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden bg-background text-muted-foreground"
    >
      <HibernatedLines tabId={tab.id} visible={visible} />
      <div className="relative flex max-w-[80%] flex-col items-center gap-5 rounded-xl border border-border bg-background px-10 py-8 shadow-sm">
        <HugeiconsIcon icon={SleepingIcon} size={96} strokeWidth={1} className="opacity-70" />
        <div className="flex max-w-full flex-col items-start gap-1.5 self-stretch text-left">
          <span className="flex max-w-full items-center gap-2 text-[15px] text-foreground">
            <span className="flex size-4 shrink-0 items-center justify-center">
              {agent && !tab.icon ? <AgentIcon agent={agent} size={14} /> : tabIcon(tab)}
            </span>
            <span className="truncate">{title}</span>
          </span>
          {folder && (
            <span title={folder} data-hibernated-folder className="max-w-full truncate font-mono text-[11.5px]">
              {tildePath(folder, cachedHomeDir())}
            </span>
          )}
          {command && (
            <span title={command} className="max-w-full truncate font-mono text-[11.5px] opacity-70">
              {command}
            </span>
          )}
          <span className="text-[12px]">Hibernated for {formatHibernatedFor(now - at)}</span>
        </div>
        <Button size="lg" variant={focused ? "default" : "secondary"} onClick={onWake} className="gap-2">
          <HugeiconsIcon icon={UploadCircle01Icon} size={16} strokeWidth={2} />
          Restore
          {shortcutLabel && <span className="text-[11px] font-normal opacity-70">{shortcutLabel}</span>}
        </Button>
      </div>
    </div>
  );
}
