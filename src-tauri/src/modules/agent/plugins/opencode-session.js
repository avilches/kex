// kex-opencode-v1
// Kex (app.betauer.kex) session reporter for OpenCode. OpenCode loads plugins from
// ~/.config/opencode/plugins/ automatically; this one turns every new session into a
// single SessionStart frame on Kex's per-terminal socket so a closed tab can be
// resumed on the next launch. Outside Kex (no KEX_IPC env set) it does nothing.

export const KexSessionPlugin = async () => {
  const socketPath = process.env.KEX_IPC
  if (!socketPath || !process.env.KEX_TAB_ID) return {}

  const reported = new Set()

  return {
    event: async ({ event }) => {
      if (event?.type !== "session.created") return
      const session = event.properties?.info || event.properties?.session || event.properties
      const id = session?.id || session?.sessionID
      if (!id || reported.has(id)) return
      reported.add(id)
      // A parent is how OpenCode marks task subagent sessions; the tab resumes the main one.
      if (session?.parentID || session?.parent_id) return

      const frame = JSON.stringify({
        hook_event_name: "SessionStart",
        agent: "opencode",
        session_id: id,
        transcript_path: "",
        // The plugin host is born in the launch directory and never moves: cd inside the
        // TUI changes the session, not this process.
        cwd: session?.directory || process.cwd(),
        source: "startup",
      })

      try {
        const net = await import("node:net")
        await new Promise((resolve) => {
          const client = net.connect(socketPath)
          const finish = () => { clearTimeout(timer); client.destroy(); resolve() }
          // Arms the whole send, connect included: a listener that accepts but never
          // confirms the write must not park this handler forever.
          const timer = setTimeout(finish, 2000)
          client.on("error", () => { clearTimeout(timer); client.destroy(); resolve() })
          client.on("connect", () => { client.end(frame + "\n", finish) })
        })
      } catch {}
    },
  }
}
