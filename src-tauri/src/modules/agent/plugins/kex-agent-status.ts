// kex-agent-status-v5
// Kex terminal integration. Loaded by OpenCode's plugin system or by OMP/Pi extension
// discovery, it translates the runtime's lifecycle events into the same JSON frames the
// Claude Code hooks emit on Kex's Unix socket (KEX_IPC). Without the per-terminal KEX_IPC
// and KEX_TAB_ID variables the extension does nothing, so a bare `omp` or `pi` run is untouched.
// The installer stamps the runtime name (omp or pi) into the agent constant below.

// @ts-expect-error - the OMP/Pi extension host resolves node builtins.
const net = require("node:net");

interface KexRuntime {
  on(event: string, handler: (event: unknown, ctx: unknown) => void): void;
  events?: { on?(channel: string, handler: (data: unknown) => void): void };
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
  source?: string;
  agent_id?: string;
  agent_type?: string;
  description?: string;
}

const socketPath = String(process.env.KEX_IPC || "");
const tabId = String(process.env.KEX_TAB_ID || "");

// A one-shot run (-p / --print) is not a session worth restoring or showing in the tab.
const printMode = (() => {
  const args = process.argv.slice(2);
  const end = args.indexOf("--");
  return (end < 0 ? args : args.slice(0, end)).some((a) => a === "-p" || a === "--print");
})();

function send(frame: KexFrame): void {
  if (!socketPath || !tabId || printMode) return;
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

function reportSession(agent: string, sessionId: unknown, cwd: string, file: string): void {
  if (typeof sessionId !== "string" || !sessionId || seenSessions.has(sessionId)) return;
  // A second session in the same process (/new, /resume) continues the command the tab
  // already launched, so Kex keeps that launch line instead of forgetting it.
  const source = seenSessions.size > 0 ? "resume" : "startup";
  seenSessions.add(sessionId);
  send({
    hook_event_name: "SessionStart",
    agent,
    session_id: sessionId,
    cwd,
    transcript_path: file,
    source,
  });
}

// The session file path is what the tab's Reveal Transcript menu and the live model
// read need; the runtime only exposes it through the session manager.
type SessionManager = {
  getSessionId?: () => unknown;
  getSessionFile?: () => unknown;
  getHeader?: () => unknown;
};

function sessionCoords(ctx: unknown, cwd: string): [unknown, string, string] {
  const manager = (ctx as { sessionManager?: SessionManager } | null)?.sessionManager;
  const file = manager?.getSessionFile?.();
  return [manager?.getSessionId?.(), cwd, typeof file === "string" ? file : ""];
}

// OMP runs a subagent in the same process and opens its own session, whose header names the
// parent. Such a session is a row under the tab, never the session the tab restores.
function isSubagentSession(ctx: unknown): boolean {
  const manager = (ctx as { sessionManager?: SessionManager } | null)?.sessionManager;
  const header = manager?.getHeader?.() as { parentSession?: unknown } | null | undefined;
  return typeof header?.parentSession === "string" && header.parentSession !== "";
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
  const agent = "__KEX_AGENT__";

  // The session exists as soon as the runtime starts it, before any prompt: reporting it
  // here is what puts the agent icon and the transcript menu on a restored tab right away.
  // The session the subagents belong to: the tab shows them under the one it is showing.
  let currentSession = "";
  let currentFile = "";
  let currentDir = cwd;
  const track = (ctx: unknown) => {
    const [id, dir, file] = sessionCoords(ctx, cwd);
    if (typeof id === "string" && id) {
      currentSession = id;
      currentDir = dir;
      currentFile = file;
    }
  };

  // OMP runs subagents through its task tool and announces each one on an internal channel;
  // Pi has no subagents, so the channel never fires there.
  const running = new Set<string>();
  pi.events?.on?.("task:subagent:lifecycle", (data) => {
    const d = data as { id?: unknown; status?: unknown; agent?: unknown; description?: unknown };
    if (typeof d?.id !== "string" || !d.id || !currentSession) return;
    const ended = d.status === "completed" || d.status === "failed" || d.status === "aborted";
    if (d.status === "started") {
      if (running.has(d.id)) return;
      running.add(d.id);
    } else if (ended) {
      if (!running.delete(d.id)) return;
    } else {
      return;
    }
    send({
      hook_event_name: d.status === "started" ? "SubagentStart" : "SubagentStop",
      agent,
      session_id: currentSession,
      cwd: currentDir,
      transcript_path: currentFile,
      agent_id: d.id,
      agent_type: typeof d.agent === "string" ? d.agent : "",
      description: typeof d.description === "string" ? d.description : d.id,
    });
  });

  // OMP announces a /new or /resume with session_switch; Pi fires session_start again.
  for (const name of ["session_start", "session_switch"]) {
    pi.on(name, (_event, ctx) => {
      if (isSubagentSession(ctx)) return;
      track(ctx);
      const [id, dir, file] = sessionCoords(ctx, cwd);
      reportSession(agent, id, dir, file);
    });
  }

  pi.on("before_agent_start", (event, ctx) => {
    if (isSubagentSession(ctx)) return;
    track(ctx);
    lastAssistantMessage = "";
    agentEndReported = false;
    const [id, dir, file] = sessionCoords(ctx, cwd);
    reportSession(agent, id, dir, file);
    send({
      hook_event_name: "UserPromptSubmit",
      agent,
      session_id: typeof id === "string" ? id : "",
      cwd: dir,
      transcript_path: file,
      prompt: typeof (event as { prompt?: unknown })?.prompt === "string" ? String((event as { prompt?: unknown }).prompt) : "",
    });
  });

  pi.on("agent_start", (_event, ctx) => {
    if (isSubagentSession(ctx)) return;
    track(ctx);
    lastAssistantMessage = "";
    agentEndReported = false;
    const [id, dir, file] = sessionCoords(ctx, cwd);
    reportSession(agent, id, dir, file);
    send({
      hook_event_name: "UserPromptSubmit",
      agent,
      session_id: typeof id === "string" ? id : "",
      cwd: dir,
      transcript_path: file,
    });
  });

  pi.on("tool_approval_requested", (event, ctx) => {
    // A subagent that asks raises attention on the tab, under the session the tab shows.
    const subagent = isSubagentSession(ctx);
    const [id, dir, file] = sessionCoords(ctx, cwd);
    if (!subagent) reportSession(agent, id, dir, file);
    send({
      hook_event_name: "PermissionRequest",
      agent,
      session_id: subagent ? currentSession : typeof id === "string" ? id : "",
      cwd: subagent ? currentDir : dir,
      transcript_path: subagent ? currentFile : file,
      tool_name: String((event as { toolName?: unknown })?.toolName || ""),
    });
  });

  pi.on("message_end", (event, ctx) => {
    if (isSubagentSession(ctx)) return;
    const message = (event as { message?: { role?: unknown; content?: unknown } })?.message;
    if (message?.role !== "assistant") return;
    lastAssistantMessage = extractAssistantText(message.content);
    const [id, dir, file] = sessionCoords(ctx, cwd);
    reportSession(agent, id, dir, file);
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (isSubagentSession(ctx)) return;
    postAgentEnd(ctx);
  });

  pi.on("agent_end", (event, ctx) => {
    // Pi keeps working after agent_end (retries, compaction, queued work) and only
    // agent_settled is final; OMP has no agent_settled and flags continuations itself.
    if (agent === "pi" || isSubagentSession(ctx)) return;
    if ((event as { willContinue?: unknown })?.willContinue === true) return;
    postAgentEnd(ctx);
  });

  function postAgentEnd(ctx: unknown): void {
    if (agentEndReported) return;
    agentEndReported = true;
    const [id, dir, file] = sessionCoords(ctx, cwd);
    reportSession(agent, id, dir, file);
    send({
      hook_event_name: "Stop",
      agent,
      session_id: typeof id === "string" ? id : "",
      cwd: dir,
      transcript_path: file,
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
