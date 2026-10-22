import type { ScriptCwdMode } from "@/modules/workspaces/lib/types";

export type Action = {
  id: string;
  name: string;
  /** true: a script, typed into a terminal and stoppable. false: an app, spawned in the background. */
  runInTerminal: boolean;
  /** Command template, expanded against the current context at run time. */
  command: string;
  /** Detected app this action came from, for its icon and default command. */
  appId?: string;
  /** App icon kept after the user edits a preset: the Action is theirs now, the icon stays. */
  iconId?: string;
  /** Scripts only; absent means home. */
  cwdMode?: ScriptCwdMode;
  /** Only used when cwdMode is "fixed". */
  cwd?: string;
  /** Own button in the Header, or grouped in a shared menu. */
  ownButton: boolean;
};
