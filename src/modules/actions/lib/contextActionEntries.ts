import { scriptCwdProblem } from "@/modules/workspaces/lib/scriptCwd";
import { actionAvailability, agentCommandProblem, agentTitle, actionRowTitle, appTitle, byKind, scriptSubtitle, type BarContext, type SubtitleLead } from "./actionsBar";
import { acceptsFile, acceptsFolder, appAccepts } from "./actionTargets";
import { isAgent, isApp, isScript, type Action } from "./types";

export type ContextActionKind = "folder" | "file";

export type ContextActionEntry = {
  action: Action;
  /** false is a muted row with its reason; selecting it runs nothing. */
  enabled: boolean;
  reason: string | null;
  /** The line under the name: what the row's file or folder gives the variable. */
  subtitle: string | null;
  /** The subtitle is a path a long value renders with its start cut. */
  subtitleTrim: boolean;
  /** The icon drawn before the subtitle. */
  subtitleLead: SubtitleLead | null;
  /** The hover words of an enabled row (where it opens); null says nothing. */
  title: string | null;
};

export type ContextActionGroups = { workspace: ContextActionEntry[]; global: ContextActionEntry[] };

type Options = {
  /** The folder an agent is started in: the row's own. Without one agents are left out. */
  agentFolder?: string;
  /** What the row is, which an app is judged against: it is muted when it does not take it. */
  rowKind?: "file" | "folder";
};

// Why an app cannot open this kind of row, or null when it can.
function acceptsReason(action: Action, rowKind: "file" | "folder" | undefined): string | null {
  if (!isApp(action) || !rowKind) return null;
  const accepts = appAccepts(action);
  if (rowKind === "file" && !acceptsFile(accepts)) return "takes folders only";
  if (rowKind === "folder" && !acceptsFolder(accepts)) return "takes files only";
  return null;
}

function entriesOf(actions: readonly Action[], ctx: BarContext, { agentFolder, rowKind }: Options = {}): ContextActionEntry[] {
  const rows: ContextActionEntry[] = [];
  for (const action of byKind(actions)) {
    if (action.command.trim() === "") continue;
    const agent = isAgent(action);
    if (agent && !agentFolder) continue;
    const name = action.name.trim() || "Action";
    // An agent has no folder of its own: here it starts in the folder of the row, so that is
    // what its line says, and it only needs a command that is safe to type.
    const subtitle = agent
      ? { text: agentFolder ?? null, startTrim: true, lead: "tab" as const }
      : scriptSubtitle({ ...action, name }, ctx);
    const reason = agent ? agentReason(action, agentFolder ?? "") : (acceptsReason(action, rowKind) ?? actionAvailability(action, ctx));
    rows.push({
      action,
      enabled: reason === null,
      reason,
      subtitle: subtitle.text,
      subtitleTrim: subtitle.startTrim,
      subtitleLead: subtitle.lead ?? null,
      title: agent ? agentTitle(name, null) : isApp(action) ? appTitle(name, null, ctx) : actionRowTitle(name, isScript(action), null, ctx),
    });
  }
  return rows;
}

// An agent started from a row needs a command that is safe to type and a folder the runner would
// accept; the workspace root does not matter, because the row brings its own folder.
function agentReason(action: Action, folder: string): string | null {
  return agentCommandProblem(action.command) ?? scriptCwdProblem(folder);
}

/** Every Action a folder or file row offers, grouped and ordered as the Header combo does
 * (workspace first, global after, agents, then scripts, then apps), including the ones that have
 * their own button there. The ones whose variables cannot be filled from the row are muted
 * entries with why. Agents appear only on a folder row, started in that folder. */
export function contextActionEntries(
  local: readonly Action[],
  global: readonly Action[],
  ctx: BarContext,
  options: Options = {},
): ContextActionGroups {
  return { workspace: entriesOf(local, ctx, options), global: entriesOf(global, ctx, options) };
}

/** What the New terminal palette offers on a folder row: only the agents, started in that
 * folder. Scripts and apps are never here, and only the ones that can run are listed. */
export function newTabActionEntries(
  local: readonly Action[],
  global: readonly Action[],
  ctx: BarContext,
): ContextActionGroups {
  const folder = ctx.folders?.focusFolder?.trim() ?? "";
  if (!folder) return { workspace: [], global: [] };
  const agents = (actions: readonly Action[]) =>
    entriesOf(actions.filter(isAgent), ctx, { agentFolder: folder }).filter((e) => e.enabled);
  return { workspace: agents(local), global: agents(global) };
}
