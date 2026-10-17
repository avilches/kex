// kex-omp-v1
// Kex terminal integration. Loaded by OpenCode's plugin system or by OMP/Pi extension
// discovery, it translates the runtime's lifecycle events into the same JSON frames the
// Claude Code hooks emit on Kex's Unix socket (KEX_IPC). Without the per-terminal KEX_IPC
// and KEX_TAB_ID variables the extension does nothing, so a bare `omp` run is untouched.

// @ts-expect-error - the OMP/Pi extension host resolves node builtins.
const net = require("node:net");

interface KexRuntime {
  on(event: string, handler: (event: unknown, ctx: unknown) => void): void;
}

interface KexFrame {
  hook_event_name: string;
  agent: string;
  session_id: string;
  cwd?: string;
  transcript_path?: string;
  prompt?: string;
  tool_name?: string;
  last_assistant_message?: string;
}

const socketPath = String(process.env.KEX_IPC || "");
const tabId = String(process.env.KEX_TAB_ID || "");

function send(frame: KexFrame): void {
  if (!socketPath || !tabId) return;
  try {
    let client: {
      on(eventName: string, handler: (...args: unknown[]) => void): void;
      end(frame: string, callback?: () => void): void;
      destroy?: () => void;
    };
    const finish = () => { clearTimeout(timer); client.destroy?.(); };
    const timer = setTimeout(finish, 1000);
    try {
      client = net.connect(socketPath);
      client.on("error", () => finish());
      client.on("connect", () => {
        client.end(JSON.stringify({ ...frame, tab_id: tabId }) + "\n", () => finish());
      });
    } catch {
      clearTimeout(timer);
      finish();
    }
  } catch {
    // Status delivery must never surface inside the agent's TUI.
  }
}

// One SessionStart per session id: the frames drive the session store's record, and the
// runtime fires several lifecycle events for the same session.
const seenSessions = new Set<string>();

function reportSession(agent: string, sessionId: unknown, cwd: string): void {
  if (typeof sessionId !== "string" || !sessionId || seenSessions.has(sessionId)) return;
  seenSessions.add(sessionId);
  send({
    hook_event_name: "SessionStart",
    agent,
    session_id: sessionId,
    cwd,
  });
}

function sessionCoords(ctx: unknown, cwd: string): [unknown, string] {
  const manager = (ctx as { sessionManager?: { getSessionId?: () => unknown } } | null)?.sessionManager;
  const id = manager?.getSessionId?.();
  return [id, cwd];
}

let lastAssistantMessage = "";
let agentEndReported = false;

export default function (pi: KexRuntime): void {
  // Subagents inherit the environment of their parent, which already registered this
  // extension: only the process that first loaded it may talk to Kex.
  const ownerPid = process.env.KEX_AGENT_STATUS_OWNED;
  const selfPid = String(process.pid);
  if (ownerPid && ownerPid !== selfPid) return;
  process.env.KEX_AGENT_STATUS_OWNED = selfPid;

  const cwd = process.cwd();
  const agent = "omp";

  pi.on("before_agent_start", (event, ctx) => {
    lastAssistantMessage = "";
    agentEndReported = false;
    const [id, dir] = sessionCoords(ctx, cwd);
    reportSession(agent, id, dir);
    send({
      hook_event_name: "UserPromptSubmit",
      agent,
      session_id: typeof id === "string" ? id : "",
      cwd: dir,
      prompt: typeof (event as { prompt?: unknown })?.prompt === "string" ? String((event as { prompt?: unknown }).prompt) : "",
    });
  });

  pi.on("agent_start", (_event, ctx) => {
    lastAssistantMessage = "";
    agentEndReported = false;
    const [id, dir] = sessionCoords(ctx, cwd);
    reportSession(agent, id, dir);
    send({
      hook_event_name: "UserPromptSubmit",
      agent,
      session_id: typeof id === "string" ? id : "",
      cwd: dir,
    });
  });

  pi.on("tool_approval_requested", (event, ctx) => {
    const [id, dir] = sessionCoords(ctx, cwd);
    reportSession(agent, id, dir);
    send({
      hook_event_name: "PermissionRequest",
      agent,
      session_id: typeof id === "string" ? id : "",
      cwd: dir,
      tool_name: String((event as { toolName?: unknown })?.toolName || ""),
    });
  });

  pi.on("message_end", (event, ctx) => {
    const message = (event as { message?: { role?: unknown; content?: unknown } })?.message;
    if (message?.role !== "assistant") return;
    lastAssistantMessage = extractAssistantText(message.content);
    const [id, dir] = sessionCoords(ctx, cwd);
    reportSession(agent, id, dir);
  });

  pi.on("agent_settled", (_event, ctx) => {
    postAgentEnd(ctx);
  });

  pi.on("agent_end", (event, ctx) => {
    if ((event as { willContinue?: unknown })?.willContinue === true) return;
    postAgentEnd(ctx);
  });

  function postAgentEnd(ctx: unknown): void {
    if (agentEndReported) return;
    agentEndReported = true;
    const [id, dir] = sessionCoords(ctx, cwd);
    reportSession(agent, id, dir);
    send({
      hook_event_name: "Stop",
      agent,
      session_id: typeof id === "string" ? id : "",
      cwd: dir,
      last_assistant_message: lastAssistantMessage,
    });
  }
}

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const part of content) {
    if (part && typeof part === "object" && (part as { type?: unknown }).type === "text") {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") out += text;
    }
  }
  return out;
}
