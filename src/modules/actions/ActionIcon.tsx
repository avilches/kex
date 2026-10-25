import { AppWindowIcon, ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { EditorIcon } from "@/modules/external-editors/EditorIcon";
import type { Action } from "./lib/types";

type Props = {
  action: Pick<Action, "appId" | "kind"> & { iconId?: string };
  size?: number;
  /**
   * The one size of an Action icon wherever an Action is listed: 24px, centered on the two
   * lines of its name (`ActionNameLines`).
   */
  fill?: boolean;
};

// An app shows the icon of the detected app it came from; an agent its logo (the generic robot
// without one); a script the terminal glyph; a user app the window glyph.
export function ActionIcon({ action, size = 14, fill }: Props) {
  const id = action.appId || action.iconId;
  const agent = action.kind === "agent";
  const icon = action.kind === "script" ? ComputerTerminal01Icon : AppWindowIcon;
  if (!fill) {
    if (agent) return <AgentIcon agent={id ?? ""} size={size} className="shrink-0" />;
    if (id) return <EditorIcon id={id} size={size} />;
    return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} />;
  }
  return (
    <span
      data-action-icon-fill
      className="relative size-6 shrink-0 text-muted-foreground"
    >
      {agent ? (
        <AgentIcon agent={id ?? ""} size={size} className="absolute inset-0 size-full!" />
      ) : id ? (
        <EditorIcon id={id} size={size} className="absolute inset-0 size-full" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} className="size-[70%]" />
        </span>
      )}
    </span>
  );
}
