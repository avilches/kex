import { AppWindowIcon, ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EditorIcon } from "@/modules/external-editors/EditorIcon";
import type { Action } from "./lib/types";

type Props = {
  action: Pick<Action, "appId" | "runInTerminal"> & { iconId?: string };
  size?: number;
  /**
   * The one size of an Action icon wherever an Action is listed: a square as tall as its two
   * lines (`ActionNameLines`: 12px and 9.5px, both `leading-tight`, 26.875px), so the top edge
   * meets the top of the name and the bottom edge the bottom of the line under it.
   */
  fill?: boolean;
};

// An app shows the icon of the detected app it came from; a script the terminal glyph; a user app the window glyph.
export function ActionIcon({ action, size = 14, fill }: Props) {
  const app = action.appId || action.iconId;
  const icon = action.runInTerminal ? ComputerTerminal01Icon : AppWindowIcon;
  if (!fill) {
    if (app) return <EditorIcon id={app} size={size} />;
    return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} />;
  }
  return (
    <span
      data-action-icon-fill
      className="relative size-[26.875px] shrink-0 text-muted-foreground"
    >
      {app ? (
        <EditorIcon id={app} size={size} className="absolute inset-0 size-full" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} className="size-[70%]" />
        </span>
      )}
    </span>
  );
}
