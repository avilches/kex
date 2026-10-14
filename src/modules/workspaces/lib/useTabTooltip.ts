import { useCallback, useState } from "react";
import { native } from "@/lib/native";
import type { AgentSession } from "@/modules/agents/lib/types";
import { formatTabTooltip, tabTooltipDir } from "./tabTooltip";
import type { Tab } from "./types";

// The branch is resolved on hover: the native tooltip only shows after a delay,
// by which time the lookup has usually settled.
export function useTabTooltip(tab: Tab, agentSession: AgentSession | undefined) {
  const dir = tabTooltipDir(tab, agentSession);
  const [branch, setBranch] = useState<{ dir: string; name: string | null } | null>(null);
  const onPointerEnter = useCallback(() => {
    if (!dir) return;
    void native
      .gitResolveRepo(dir)
      .catch(() => null)
      .then((info) => setBranch({ dir, name: info && !info.isDetached ? info.branch : null }));
  }, [dir]);
  const title = formatTabTooltip(dir, branch && branch.dir === dir ? branch.name : null);
  return { title, onPointerEnter };
}
