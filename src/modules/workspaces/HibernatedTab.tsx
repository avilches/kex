import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cachedHomeDir } from "@/lib/homeDir";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { useShortcutLabel } from "@/modules/shortcuts/useShortcutLabel";
import { SleepingIcon, UploadCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { HibernatedInfo } from "./HibernatedInfo";
import { HibernatedLines } from "./HibernatedLines";
import { hibernatedLayout, type HibernatedLayout } from "./lib/hibernatedLayout";
import { formatHibernatedFor, hibernatedCommand, type SleepingTab } from "./lib/hibernate";
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

// Measured on the pane itself, so a split or a resize picks the layout that fits. A hidden tab
// measures 0x0 and keeps the layout it had.
function useLayout(): [RefObject<HTMLDivElement | null>, HibernatedLayout] {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<HibernatedLayout>("full");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width === 0 && height === 0) return;
      setLayout(hibernatedLayout(width, height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, layout];
}

type Props = { tab: SleepingTab; visible: boolean; focused: boolean; onWake: () => void };

// What a hibernated terminal tab shows in place of its terminal: no PTY and no render slot sit
// behind it, only what was captured when it went to sleep.
export function HibernatedTab({ tab, visible, focused, onWake }: Props) {
  const info = useAgentTabTitle(tab);
  const wakeLabel = useShortcutLabel("tab.wake");
  const toggleLabel = useShortcutLabel("tab.hibernate");
  const shortcuts = [wakeLabel, toggleLabel].filter((l): l is string => !!l);
  const now = useNow(visible);
  const [ref, layout] = useLayout();
  const { agent, title: frozen, at } = tab.hibernation;
  const command = hibernatedCommand(tab);
  const title = info?.displayTitle || frozen || tab.title || tab.id;
  const folder = tab.hibernation.worktreeCwd || tab.cwd;
  const full = layout === "full";
  const restore = (
    <Button size="lg" variant={focused ? "default" : "secondary"} onClick={onWake} className="gap-2">
      <HugeiconsIcon icon={UploadCircle01Icon} size={16} strokeWidth={2} />
      Restore
    </Button>
  );
  return (
    <div
      ref={ref}
      data-hibernated-tab
      data-layout={layout}
      className="relative flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden bg-background text-muted-foreground"
    >
      <HibernatedLines tabId={tab.id} visible={visible} />
      {layout === "bare" ? (
        <div className="relative">{restore}</div>
      ) : (
        <div className="relative flex w-[80%] max-w-[480px] min-w-[320px] flex-col items-center gap-5 rounded-xl border border-border bg-background px-8 pt-8 pb-3 shadow-sm">
          <HugeiconsIcon icon={SleepingIcon} size={full ? 96 : 64} strokeWidth={1} className="opacity-70" />
          <HibernatedInfo
            icon={agent && !tab.icon ? <AgentIcon agent={agent} size={14} /> : tabIcon(tab)}
            title={title}
            folder={full ? folder || null : null}
            command={full ? command || null : null}
            home={cachedHomeDir()}
          />
          {restore}
          <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px]">
            {focused && shortcuts.length > 0 ? (
              <span data-hibernated-hint className="flex items-center gap-1.5 opacity-80">
                {shortcuts.map((label, i) => (
                  <Fragment key={label}>
                    {i > 0 && "or"}
                    <Kbd className="h-[18px] min-w-0 rounded px-1.5 text-[10.5px]">{label}</Kbd>
                  </Fragment>
                ))}
                Restore
              </span>
            ) : (
              <span />
            )}
            <span className="opacity-50">Hibernated for {formatHibernatedFor(now - at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
