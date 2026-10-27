import type { AgentSession } from "@/modules/agents/lib/types";
import { AgentIcon, StruckAgentIcon } from "@/modules/agents/lib/agentIcon";
import { Alert02Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { agentIconMark, type AgentIconMark } from "./agentRestore";
import { isHibernatedTab } from "./hibernate";
import { tabIcon } from "./tabTitle";
import type { Tab } from "./types";

const ICON_MARK_TITLES: Record<NonNullable<AgentIconMark>, string> = {
  "restore-off": "Won't be restored on restart (Run on start is off)",
  "launch-unknown": "Launch command unknown: restore will use plain claude --resume",
};

// The leading icon of a tab, exactly the one the tab bar shows: a live agent's mark, the tab's
// own icon, or the icon of its kind. Shared so the pane tab bar and the command palette cannot
// drift apart.
export function TabBarIcon({
  tab,
  agentSession,
  running = false,
}: {
  tab: Tab;
  agentSession: AgentSession | undefined;
  running?: boolean;
}) {
  const hasAgent = tab.kind === "terminal" && !!agentSession;
  const isRestoreError = agentSession?.restoreError ?? false;
  const iconMark = agentIconMark(tab, agentSession);
  if (hasAgent && (isRestoreError || !tab.icon)) {
    return isRestoreError ? (
      <span
        className="text-amber-500"
        title={`Session restore failed: ${agentSession?.restoreErrorReason ?? "unknown error"}`}
      >
        <HugeiconsIcon icon={Alert02Icon} size={13} strokeWidth={1.5} />
      </span>
    ) : iconMark ? (
      <StruckAgentIcon agent={agentSession.agent} size={13} title={ICON_MARK_TITLES[iconMark]} />
    ) : (
      <AgentIcon agent={agentSession.agent} size={13} />
    );
  }
  if (isHibernatedTab(tab) && tab.hibernation.agent && !tab.icon) {
    return <AgentIcon agent={tab.hibernation.agent} size={13} className="grayscale" />;
  }
  if (tab.kind === "browser" && tab.floating) {
    return <HugeiconsIcon icon={LinkSquare02Icon} size={13} strokeWidth={1.75} className="opacity-60" />;
  }
  return tabIcon(tab, running);
}
