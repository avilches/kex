import { AppWindowIcon, ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AgentIcon } from "@/modules/agents/lib/agentIcon";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { EditorIcon } from "@/modules/external-editors/EditorIcon";
import { glyphIcon } from "./lib/actionIcons";
import { parseIcon } from "./lib/actionIconRefs";
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

type Drawn =
  | { type: "glyph"; icon: typeof AppWindowIcon }
  | { type: "agent"; id: string }
  | { type: "app"; id: string };

// What an Action draws. The icon the user picked wins. Without one, an app shows the icon of the
// detected app it came from; an agent its logo (the generic robot without one); a script the
// terminal glyph; a user app the window glyph.
function resolve(action: Props["action"]): Drawn {
  const picked = parseIcon(action.icon);
  if (picked?.source === "glyph") return { type: "glyph", icon: glyphIcon(picked.name) };
  if (picked) return { type: picked.source, id: picked.id };
  const id = action.appId || action.iconId;
  if (action.kind === "agent") return { type: "agent", id: id ?? "" };
  if (id) return { type: "app", id };
  return { type: "glyph", icon: action.kind === "script" ? ComputerTerminal01Icon : AppWindowIcon };
}

// The same drawing in both sizes: plain at its own size, or filling the box the `actionIconSize`
// preference sets, where a glyph is shrunk to 70% so it matches the weight of a logo.
function Drawing({ drawn, size, fill }: { drawn: Drawn; size: number; fill: boolean }) {
  if (drawn.type === "glyph") {
    const glyph = <HugeiconsIcon icon={drawn.icon} size={size} strokeWidth={1.75} className={fill ? "size-[70%]" : undefined} />;
    return fill ? <span className="absolute inset-0 flex items-center justify-center">{glyph}</span> : glyph;
  }
  if (drawn.type === "agent") {
    return <AgentIcon agent={drawn.id} size={size} className={fill ? "absolute inset-0 size-full!" : "shrink-0"} />;
  }
  return <EditorIcon id={drawn.id} size={size} className={fill ? "absolute inset-0 size-full" : undefined} />;
}

export function ActionIcon({ action, size = 14, fill }: Props) {
  const boxSize = usePreferencesStore((s) => s.actionIconSize);
  const drawn = resolve(action);
  if (!fill) return <Drawing drawn={drawn} size={size} fill={false} />;
  return (
    <span
      data-action-icon-fill
      style={{ width: boxSize, height: boxSize }}
      className="relative shrink-0 text-muted-foreground"
    >
      <Drawing drawn={drawn} size={size} fill />
    </span>
  );
}
