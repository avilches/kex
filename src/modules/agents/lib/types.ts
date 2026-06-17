export type AgentStatus = "working" | "waiting" | "idle";

export type AgentSource = "terminal" | "local";

export type AgentSignalKind =
  | "started"
  | "UserPromptSubmit"
  | "Notification"
  | "Stop"
  | "StopFailure"
  | "SessionEnd"
  | "PermissionRequest"
  | "exited";

export type AgentSignal = {
  id: number;
  kind: AgentSignalKind;
  agent: string | null;
  message?: string;
  toolName?: string;
};

export type AgentSessionMeta = {
  sessionId?: string;
  cwdLaunch?: string;
  // extension futura: contextPct?: number; model?: string;
};

export type AgentSession = {
  panelId: string;
  tabId: string;
  agent: string;
  status: AgentStatus;
  startedAt: number;
  lastActivityAt: number;
  attentionSince: number | null;
  restored: boolean;
  restoreError: boolean;
  restoreErrorReason?: string;
  meta?: AgentSessionMeta;
};

export type AgentNotification = {
  id: string;
  source: AgentSource;
  panelId: string;
  tabId: string;
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
