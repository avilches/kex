export type AgentStatus = "working" | "attention" | "idle";

export type AgentSource = "terminal" | "local";

type AgentSignalKind =
  | "started"
  | "UserPromptSubmit"
  | "Notification"
  | "Stop"
  | "StopFailure"
  | "SessionEnd"
  | "PermissionRequest"
  | "MessageDisplay"
  | "SubagentStart"
  | "SubagentStop"
  | "PostCompact"
  | "exited";

export type SubagentRecord = {
  agentType: string;
  description?: string;
  startedAt: number;
};

export type BackgroundSubagent = {
  id: string;
  agentType: string;
  description: string;
};

export type AgentSignal = {
  id: number;
  // Set on hook signals, which can arrive while the frontend does not know the tab's PTY id
  // yet (a spooled replay during pty_open, a late frame during a respawn). Absent on the PTY
  // reader's own signals, whose PTY is always the tab's live one.
  tabId?: string;
  kind: AgentSignalKind;
  agent: string | null;
  message?: string;
  toolName?: string;
  prompt?: string;
  trigger?: string;
  agentId?: string;
  agentType?: string;
  agentDescription?: string;
  backgroundSubagents?: BackgroundSubagent[];
};

export type AgentSessionMeta = {
  sessionId?: string;
  cwdLaunch?: string;
  sessionTitle?: string;
  model?: string;
  transcriptPath?: string;
  agentCwd?: string;
  worktreeCwd?: string;
  /** False when the launcher was not recognised, so a restore can only use the agent's plain command. */
  launchKnown?: boolean;
};

export type AgentSession = {
  tabId: string;
  workspaceId: string;
  agent: string;
  status: AgentStatus;
  startedAt: number;
  lastActivityAt: number;
  attentionSince: number | null;
  restored: boolean;
  restoreError: boolean;
  restoreErrorReason?: string;
  interrupted?: boolean;
  subagents: Record<string, SubagentRecord>;
  meta?: AgentSessionMeta;
};

export type AgentNotification = {
  id: string;
  source: AgentSource;
  tabId: string;
  workspaceId: string;
  agent: string;
  kind: NotificationKind;
  at: number;
  read: boolean;
};

export type NotificationKind = "attention" | "finished" | "error";

export type LocalAgentState = {
  agent: string;
  status: AgentStatus;
} | null;
