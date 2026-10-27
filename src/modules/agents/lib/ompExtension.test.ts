import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts_ from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: Array<Record<string, unknown>> = [];

const TEMPLATE = resolve(process.cwd(), "src-tauri/src/modules/agent/plugins/kex-agent-status.ts");

type Handler = (event: unknown, ctx: unknown) => void;

// Evaluates the shipped extension (stamped like the installer does) against a fake runtime
// whose socket records every frame.
function loadExtension(agent: "omp" | "pi", argv: string[] = []) {
  const handlers = new Map<string, Handler[]>();
  const channels = new Map<string, Array<(d: unknown) => void>>();
  const run = new Function(
    "module",
    "exports",
    "require",
    "process",
    transpile(readFileSync(TEMPLATE, "utf8").replace("__KEX_AGENT__", agent)),
  );
  const module = { exports: {} as { default?: (pi: unknown) => void } };
  const fakeProcess = {
    env: { KEX_IPC: "/tmp/kex.sock", KEX_TAB_ID: "tab-1", KEX_PTY_ID: "7" } as Record<string, string>,
    argv: ["bun", "/x/omp", ...argv],
    pid: 4242,
    cwd: () => "/work",
  };
  run(
    module,
    module.exports,
    (name: string) => {
      if (name !== "node:net") throw new Error(name);
      return {
        connect: () => ({
          on: (n: string, fn: () => void) => n === "connect" && setTimeout(fn, 0),
          end: (data: string, cb: () => void) => {
            sent.push(JSON.parse(data));
            cb();
          },
          destroy: () => {},
        }),
      };
    },
    fakeProcess,
  );
  module.exports.default!({
    on: (name: string, fn: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
    events: {
      on: (ch: string, fn: (d: unknown) => void) => channels.set(ch, [...(channels.get(ch) ?? []), fn]),
    },
  });
  const ctx = (id: string, parentSession?: string) => ({
    sessionManager: {
      getSessionId: () => id,
      getSessionFile: () => `/s/${id}.jsonl`,
      getHeader: () => (parentSession ? { parentSession } : { type: "session" }),
    },
  });
  return {
    fire: (name: string, event: unknown, c: unknown) => handlers.get(name)?.forEach((h) => {
      h(event, c);
    }),
    channel: (ch: string, data: unknown) => channels.get(ch)?.forEach((h) => {
      h(data);
    }),
    ctx,
    handlers,
  };
}

// The template is TypeScript; the runtimes strip the types when they load it, and so does this.
function transpile(ts: string): string {
  return ts_.transpileModule(ts, {
    compilerOptions: { module: ts_.ModuleKind.CommonJS, target: ts_.ScriptTarget.ES2022 },
  }).outputText;
}

const settle = () => new Promise((r) => setTimeout(r, 5));
const names = () => sent.map((f) => String(f.hook_event_name));

beforeEach(() => {
  sent.length = 0;
  vi.useRealTimers();
});

describe("kex-agent-status extension", () => {
  it("reports the session at startup, before any prompt", async () => {
    const x = loadExtension("omp");
    x.fire("session_start", { type: "session_start" }, x.ctx("s1"));
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      hook_event_name: "SessionStart",
      agent: "omp",
      session_id: "s1",
      transcript_path: "/s/s1.jsonl",
      source: "startup",
    });
  });

  it("names its tab and PTY on every frame, since Kex has one socket for all tabs", async () => {
    const x = loadExtension("omp");
    x.fire("session_start", {}, x.ctx("s1"));
    x.fire("before_agent_start", { prompt: "hi" }, x.ctx("s1"));
    await settle();
    expect(sent.length).toBeGreaterThan(1);
    for (const f of sent) expect(f).toMatchObject({ tab_id: "tab-1", pty_id: "7" });
  });

  it("stamps the runtime name into every frame", async () => {
    const x = loadExtension("pi");
    x.fire("session_start", {}, x.ctx("s1"));
    await settle();
    expect(sent[0].agent).toBe("pi");
  });

  it("reports /new as a second session of the same process, keeping the launch command", async () => {
    const x = loadExtension("omp");
    x.fire("session_start", {}, x.ctx("s1"));
    x.fire("session_switch", {}, x.ctx("s2"));
    x.fire("session_switch", {}, x.ctx("s2"));
    await settle();
    expect(sent.map((f) => `${f.session_id}:${f.source}`)).toEqual(["s1:startup", "s2:resume"]);
  });

  it("stays silent in print mode, also with the long flag", async () => {
    for (const flag of ["-p", "--print"]) {
      sent.length = 0;
      const x = loadExtension("omp", ["--model", "m", flag, "hola"]);
      x.fire("session_start", {}, x.ctx("s1"));
      await settle();
      expect(sent).toEqual([]);
    }
  });

  it("does not treat a -p after -- as print mode", async () => {
    const x = loadExtension("omp", ["--", "-p"]);
    x.fire("session_start", {}, x.ctx("s1"));
    await settle();
    expect(names()).toEqual(["SessionStart"]);
  });

  it("ends the turn once on OMP and ignores a continuation", async () => {
    const x = loadExtension("omp");
    x.fire("agent_start", {}, x.ctx("s1"));
    x.fire("agent_end", { willContinue: true }, x.ctx("s1"));
    x.fire("agent_end", {}, x.ctx("s1"));
    x.fire("agent_end", {}, x.ctx("s1"));
    await settle();
    expect(names().filter((n) => n === "Stop")).toHaveLength(1);
  });

  it("ends the turn on agent_settled only on Pi", async () => {
    const x = loadExtension("pi");
    x.fire("agent_start", {}, x.ctx("s1"));
    x.fire("agent_end", {}, x.ctx("s1"));
    await settle();
    expect(names()).not.toContain("Stop");
    x.fire("agent_settled", {}, x.ctx("s1"));
    await settle();
    expect(names().filter((n) => n === "Stop")).toHaveLength(1);
  });

  describe("subagents", () => {
    it("shows each subagent as a row under the session the tab shows and removes it when it ends", async () => {
      const x = loadExtension("omp");
      x.fire("before_agent_start", { prompt: "go" }, x.ctx("main"));
      x.channel("task:subagent:lifecycle", { id: "Saludar", agent: "task", status: "started" });
      x.channel("task:subagent:lifecycle", { id: "Saludar", agent: "task", status: "completed" });
      await settle();
      const subs = sent.filter((f) => String(f.hook_event_name).startsWith("Subagent"));
      expect(subs.map((f) => f.hook_event_name)).toEqual(["SubagentStart", "SubagentStop"]);
      expect(subs[0]).toMatchObject({
        session_id: "main",
        agent_id: "Saludar",
        agent_type: "task",
        description: "Saludar",
      });
    });

    it("closes the row when a subagent fails or is aborted", async () => {
      const x = loadExtension("omp");
      x.fire("before_agent_start", {}, x.ctx("main"));
      for (const status of ["failed", "aborted"]) {
        x.channel("task:subagent:lifecycle", { id: status, agent: "task", status: "started" });
        x.channel("task:subagent:lifecycle", { id: status, agent: "task", status });
      }
      await settle();
      expect(names().filter((n) => n === "SubagentStop")).toHaveLength(2);
    });

    it("ignores a repeated start, an end it never saw and unknown statuses", async () => {
      const x = loadExtension("omp");
      x.fire("before_agent_start", {}, x.ctx("main"));
      x.channel("task:subagent:lifecycle", { id: "a", status: "started" });
      x.channel("task:subagent:lifecycle", { id: "a", status: "started" });
      x.channel("task:subagent:lifecycle", { id: "ghost", status: "completed" });
      x.channel("task:subagent:lifecycle", { id: "a", status: "paused" });
      x.channel("task:subagent:lifecycle", { id: "", status: "started" });
      await settle();
      expect(names().filter((n) => n.startsWith("Subagent"))).toEqual(["SubagentStart"]);
    });

    it("sends nothing before the main session is known", async () => {
      const x = loadExtension("omp");
      x.channel("task:subagent:lifecycle", { id: "a", status: "started" });
      await settle();
      expect(sent).toEqual([]);
    });

    it("never lets a subagent's own session become the tab's session or end its turn", async () => {
      const x = loadExtension("omp");
      x.fire("session_start", {}, x.ctx("main"));
      const child = x.ctx("child", "/s/main.jsonl");
      x.fire("session_start", {}, child);
      x.fire("before_agent_start", { prompt: "child prompt" }, child);
      x.fire("agent_start", {}, child);
      x.fire("message_end", { message: { role: "assistant", content: "child text" } }, child);
      x.fire("agent_end", {}, child);
      await settle();
      expect(names()).toEqual(["SessionStart"]);
      expect(sent.every((f) => f.session_id === "main")).toBe(true);
    });

    it("raises attention on the main session when a subagent asks for approval", async () => {
      const x = loadExtension("omp");
      x.fire("before_agent_start", {}, x.ctx("main"));
      x.fire("tool_approval_requested", { toolName: "bash" }, x.ctx("child", "/s/main.jsonl"));
      await settle();
      expect(sent[sent.length - 1]).toMatchObject({
        hook_event_name: "PermissionRequest",
        session_id: "main",
        tool_name: "bash",
      });
    });

    it("does nothing on Pi, which has no subagent channel", async () => {
      const x = loadExtension("pi");
      x.fire("before_agent_start", {}, x.ctx("main"));
      await settle();
      expect(names().filter((n) => n.startsWith("Subagent"))).toEqual([]);
    });
  });
});
