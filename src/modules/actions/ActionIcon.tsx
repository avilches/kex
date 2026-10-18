import { ComputerTerminal01Icon, DocumentCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EditorIcon } from "@/modules/external-editors/EditorIcon";
import type { Action } from "./lib/types";

type Props = { action: Pick<Action, "appId" | "runInTerminal">; size?: number };

// An app shows the icon of the detected app it came from; a script the terminal glyph; a custom app the generic one.
export function ActionIcon({ action, size = 14 }: Props) {
  if (action.appId) return <EditorIcon id={action.appId} size={size} />;
  const icon = action.runInTerminal ? ComputerTerminal01Icon : DocumentCodeIcon;
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} />;
}
