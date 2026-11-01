import type { AppAccepts } from "@/modules/external-editors/catalog";

export type ActionKind = "app" | "script" | "agent";

/** Where a script acts: any folder it is offered at, any file, the workspace root only, or one fixed folder. */
export type ScriptRuns = "folder" | "file" | "workspace" | "fixed";

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
  /** Scripts only: the one place it acts, which decides where it is offered and where it runs. */
  runs?: ScriptRuns;
  /** Only with `runs: "fixed"`: the absolute folder it always runs in. */
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
