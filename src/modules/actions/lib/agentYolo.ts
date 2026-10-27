/** How each known agent is told to run without permission prompts: a switch after the binary, or
 * an environment assignment before it. Agents absent here have no such switch. */
type Bypass = { flag?: string; env?: string };

const BYPASS: Readonly<Record<string, Bypass>> = {
  claude: { flag: "--dangerously-skip-permissions" },
  codex: { flag: "--dangerously-bypass-approvals-and-sandbox" },
  agy: { flag: "--dangerously-skip-permissions" },
  openclaude: { flag: "--dangerously-skip-permissions" },
  grok: { flag: "--permission-mode bypassPermissions" },
  aider: { flag: "--yes-always" },
  "cursor-agent": { flag: "--yolo" },
  goose: { env: "GOOSE_MODE=auto" },
};

const ASSIGNMENT = /^\s*(?:[A-Za-z_]\w*=\S*\s+)*/;
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tokenRegex = (token: string): RegExp => new RegExp(`(^|\\s)${token.split(/\s+/).map(escapeRegex).join("\\s+")}(?=\\s|$)`, "g");

/** The agent a command starts: its binary name, past any leading `VAR=value`, without directory
 * or Windows extension. Null when the command has no binary yet. */
export function agentBinary(command: string): string | null {
  const rest = command.replace(ASSIGNMENT, "");
  const first = rest.match(/^\S+/)?.[0];
  if (!first) return null;
  return (first.split(/[\\/]/).pop() ?? "").replace(/\.(exe|cmd|bat)$/i, "") || null;
}

function bypassOf(command: string): Bypass | null {
  const binary = agentBinary(command);
  return binary ? (BYPASS[binary] ?? null) : null;
}

/** The text the checkbox stands for, or null when the command is not a known agent. */
export function yoloSwitch(command: string): string | null {
  const bypass = bypassOf(command);
  return bypass ? (bypass.env ?? bypass.flag ?? null) : null;
}

export function isYolo(command: string): boolean {
  const token = yoloSwitch(command);
  return !!token && tokenRegex(token).test(command);
}

/** Adds the switch at the end (the assignment before the binary), or removes it wherever it is. */
export function setYolo(command: string, on: boolean): string {
  const bypass = bypassOf(command);
  const token = bypass ? (bypass.env ?? bypass.flag) : null;
  if (!token) return command;
  if (!on) return command.replace(tokenRegex(token), "").trim();
  if (isYolo(command)) return command;
  if (bypass?.env) return command.replace(ASSIGNMENT, (prefix) => `${prefix.trimStart()}${token} `).trim();
  return `${command.trimEnd()} ${token}`;
}

/** A known agent's id with its bypass switch applied, or the bare id. */
export function yoloCommand(id: string): string {
  return setYolo(id, true);
}
