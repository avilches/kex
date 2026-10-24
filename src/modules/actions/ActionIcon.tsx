import { AppWindowIcon, ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { EditorIcon } from "@/modules/external-editors/EditorIcon";
import type { Action } from "./lib/types";

type Props = { action: Pick<Action, "appId" | "kind"> & { iconId?: string }; size?: number };

// An app shows the icon of the detected app it came from; an agent its logo (the generic robot
// without one); a script the terminal glyph; a user app the window glyph.
export function ActionIcon({ action, size = 14 }: Props) {
  const id = action.appId || action.iconId;
  if (action.kind === "agent") return <AgentIcon agent={id ?? ""} size={size} className="shrink-0" />;
  if (id) return <EditorIcon id={id} size={size} />;
  const icon = action.kind === "script" ? ComputerTerminal01Icon : AppWindowIcon;
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} />;
}
