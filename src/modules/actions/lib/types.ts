import type { AppAccepts } from "@/modules/external-editors/catalog";
import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";

export type ActionKind = "app" | "script" | "agent";

export type Action = {
  id: string;
  name: string;
  /** app: spawned in the background. script: typed into a terminal and stoppable. agent: a coding agent started in a terminal. */
  kind: ActionKind;
  /** Command template, expanded against the current context at run time. */
  command: string;
  /** The one identity of how it looks (`app:<id>`, `agent:<id>` or `glyph:<name>`): set when it is
   * created from a preset, changed only when the user picks another. Editing the command never touches it. */
  icon?: string;
  /** Scripts only; absent means home. An agent has no folder of its own. */
  cwdMode?: ScriptCwdMode;
  /** Only used when cwdMode is "fixed". */
  cwd?: string;
  /** Apps only: what the command's {target} may be, a file, a folder or either. */
  accepts?: AppAccepts;
  /** Own button in the Header, or grouped in a shared menu. */
  ownButton: boolean;
};

export const isApp = (a: Pick<Action, "kind">): boolean => a.kind === "app";
export const isScript = (a: Pick<Action, "kind">): boolean => a.kind === "script";
export const isAgent = (a: Pick<Action, "kind">): boolean => a.kind === "agent";
export const usesTerminal = (a: Pick<Action, "kind">): boolean => a.kind !== "app";
