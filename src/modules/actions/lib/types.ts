import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";

export type ActionKind = "app" | "script" | "agent";

export type Action = {
  id: string;
  name: string;
  /** app: spawned in the background. script: typed into a terminal and stoppable. agent: a coding agent started in a terminal. */
  kind: ActionKind;
  /** Command template, expanded against the current context at run time. */
  command: string;
  /** Detected app this action came from, for its icon and default command. */
  appId?: string;
  /** App icon kept after the user edits a preset: the Action is theirs now, the icon stays. */
  iconId?: string;
  /** Scripts and agents; absent means home. */
  cwdMode?: ScriptCwdMode;
  /** Only used when cwdMode is "fixed". */
  cwd?: string;
  /** Own button in the Header, or grouped in a shared menu. */
  ownButton: boolean;
};

export const isApp = (a: Pick<Action, "kind">): boolean => a.kind === "app";
export const isScript = (a: Pick<Action, "kind">): boolean => a.kind === "script";
export const isAgent = (a: Pick<Action, "kind">): boolean => a.kind === "agent";
export const usesTerminal = (a: Pick<Action, "kind">): boolean => a.kind !== "app";
