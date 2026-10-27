import { Button } from "@/components/ui/button";
import { cachedHomeDir } from "@/lib/homeDir";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { sessionPreviews, type SessionPreview } from "@/modules/agents/lib/agentSessionRestore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getShortcutTokens } from "@/modules/shortcuts/shortcuts";
import { SleepingIcon, UploadCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { HibernatedLines } from "./HibernatedLines";
import { formatHibernatedFor, type SleepingTab } from "./lib/hibernate";
import { restoreHint } from "./lib/wakeShortcut";
import { describeSessionPreview } from "./lib/sessionPreview";
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

// Read again each time the placeholder is shown, so a message stored by the last Stop before
// hibernating is there.
function useSessionPreview(tabId: string, active: boolean): SessionPreview | undefined {
  const [preview, setPreview] = useState<SessionPreview>();
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void sessionPreviews([tabId]).then((list) => {
      if (!cancelled) setPreview(list[0]);
    });
    return () => {
      cancelled = true;
    };
  }, [tabId, active]);
  return preview;
}

type Props = { tab: SleepingTab; visible: boolean; onWake: () => void };

// What a hibernated terminal tab shows in place of its terminal: no PTY and no render slot sit
// behind it, only what was captured when it went to sleep.
export function HibernatedTab({ tab, visible, onWake }: Props) {
  const info = useAgentTabTitle(tab);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const hint = restoreHint([getShortcutTokens("tab.wake", userShortcuts), getShortcutTokens("tab.hibernate", userShortcuts)]);
  const now = useNow(visible);
  const preview = useSessionPreview(tab.id, visible);
  const { agent, command, title: frozen, at } = tab.hibernation;
  const title = frozen || info?.displayTitle || tab.title || tab.id;
  const line = preview ? describeSessionPreview(preview, now, cachedHomeDir()) : null;
  return (
    <div
      data-hibernated-tab
      className="relative flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden bg-background text-muted-foreground"
    >
      <HibernatedLines tabId={tab.id} visible={visible} />
      <HugeiconsIcon icon={SleepingIcon} size={96} strokeWidth={1} className="relative opacity-70" />
      <div className="relative flex max-w-[80%] flex-col items-center gap-1.5">
        <span className="flex max-w-full items-center gap-2 text-[15px] text-foreground">
          <span className="flex size-4 shrink-0 items-center justify-center">
            {agent && !tab.icon ? <AgentIcon agent={agent} size={14} /> : tabIcon(tab)}
          </span>
          <span className="truncate">{title}</span>
        </span>
        {command && (
          <span title={command} className="max-w-full truncate font-mono text-[11.5px] opacity-70">
            {command}
          </span>
        )}
        <span className="text-[12px]">Hibernated for {formatHibernatedFor(now - at)}</span>
        {line?.message && (
          <span title={line.message} className="line-clamp-2 max-w-full text-center text-[11.5px] leading-snug text-foreground/80">
            {line.message}
          </span>
        )}
        {line?.meta && (
          <span title={line.metaTitle} className="max-w-full truncate text-[11px] opacity-60">
            {line.meta}
          </span>
        )}
      </div>
      <div className="relative flex flex-col items-center gap-2">
        <Button size="lg" onClick={onWake} className="gap-2">
          <HugeiconsIcon icon={UploadCircle01Icon} size={16} strokeWidth={2} />
          Restore
        </Button>
        {hint && <span className="text-[11px] opacity-70">{hint}</span>}
      </div>
    </div>
  );
}
