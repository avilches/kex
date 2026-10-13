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
  kind: AgentSignalKind;
  agent: string | null;
  message?: string;
  toolName?: string;
  prompt?: string;
  agentId?: string;
  agentType?: string;
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
