import { AppWindowIcon, ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { EditorIcon } from "@/modules/external-editors/EditorIcon";
import { glyphIcon, parseIcon, type ActionIconRef } from "./lib/actionIcons";
import type { Action } from "./lib/types";

type Props = {
  action: Pick<Action, "appId" | "kind"> & { iconId?: string; icon?: string };
  size?: number;
  /**
   * The one size of an Action icon wherever an Action is listed, the `actionIconSize`
   * preference (Settings > Appearance), centered on the two lines of its name.
   */
  fill?: boolean;
};

// The icon the user picked wins. Without one, an app shows the icon of the detected app it came
// from; an agent its logo (the generic robot without one); a script the terminal glyph; a user
// app the window glyph.
export function ActionIcon({ action, size = 14, fill }: Props) {
  const boxSize = usePreferencesStore((s) => s.actionIconSize);
  const picked = parseIcon(action.icon);
  const id = action.appId || action.iconId;
  const agent = action.kind === "agent";
  const icon = action.kind === "script" ? ComputerTerminal01Icon : AppWindowIcon;
  if (!fill) return <Plain picked={picked} agent={agent} id={id} icon={icon} size={size} />;
  return (
    <span
      data-action-icon-fill
      style={{ width: boxSize, height: boxSize }}
      className="relative shrink-0 text-muted-foreground"
    >
      <Filled picked={picked} agent={agent} id={id} icon={icon} size={size} />
    </span>
  );
}

type Parts = {
  picked: ActionIconRef | null;
  agent: boolean;
  id: string | undefined;
  icon: typeof AppWindowIcon;
  size: number;
};

function Plain({ picked, agent, id, icon, size }: Parts) {
  if (picked?.source === "glyph") return <HugeiconsIcon icon={glyphIcon(picked.name)} size={size} strokeWidth={1.75} />;
  if (picked?.source === "agent") return <AgentIcon agent={picked.id} size={size} className="shrink-0" />;
  if (picked?.source === "app") return <EditorIcon id={picked.id} size={size} />;
  if (agent) return <AgentIcon agent={id ?? ""} size={size} className="shrink-0" />;
  if (id) return <EditorIcon id={id} size={size} />;
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} />;
}

function Filled({ picked, agent, id, icon, size }: Parts) {
  const glyph = (g: typeof AppWindowIcon) => (
    <span className="absolute inset-0 flex items-center justify-center">
      <HugeiconsIcon icon={g} size={size} strokeWidth={1.75} className="size-[70%]" />
    </span>
  );
  if (picked?.source === "glyph") return glyph(glyphIcon(picked.name));
  if (picked?.source === "agent") return <AgentIcon agent={picked.id} size={size} className="absolute inset-0 size-full!" />;
  if (picked?.source === "app") return <EditorIcon id={picked.id} size={size} className="absolute inset-0 size-full" />;
  if (agent) return <AgentIcon agent={id ?? ""} size={size} className="absolute inset-0 size-full!" />;
  if (id) return <EditorIcon id={id} size={size} className="absolute inset-0 size-full" />;
  return glyph(icon);
}
