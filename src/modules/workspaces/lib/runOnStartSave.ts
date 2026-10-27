import { useAgentStore } from "@/modules/agents/store/agentStore";
import { followableCommand } from "@/modules/terminal/lib/runOnStartCommand";
import { saveRunOnStart } from "./hibernate";
import { liveAgent } from "./hibernateReview";
import { getRunningCommandsSnapshot, getRunningScriptCommand } from "./terminalEphemeralStore";
import type { SplitNode, Tab, Workspace } from "./types";

// The tab as it must be stored when it stops running, read from the live stores.
export function withLiveRunOnStart(tab: Tab): Tab {
  if (tab.kind !== "terminal" || tab.hibernation) return tab;
  const agent = liveAgent(useAgentStore.getState().sessions[tab.id]);
  return saveRunOnStart(tab, {
    running: followableCommand(getRunningCommandsSnapshot().get(tab.id) ?? null, getRunningScriptCommand(tab.id)),
    agentResumable: agent?.resumable,
  });
}

function mapTabs(node: SplitNode, fn: (t: Tab) => Tab): SplitNode {
  if (node.kind === "pane") return { ...node, tabs: node.tabs.map(fn) };
  return { ...node, first: mapTabs(node.first, fn), second: mapTabs(node.second, fn) };
}

// The workspace as the closed stack must keep it: every terminal with its Run on start saved.
export function withLiveRunOnStartAll(ws: Workspace): Workspace {
  return { ...ws, paneTree: mapTabs(ws.paneTree, withLiveRunOnStart) };
}
