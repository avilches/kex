// kex-opencode-v4
// Kex (app.betauer.kex) status reporter for OpenCode. OpenCode loads plugins from
// ~/.config/opencode/plugins/ automatically; this one turns the session lifecycle into the
// frames Claude Code's hooks emit on Kex's socket, so a closed tab can be resumed and the tab
// shows working/attention. Outside Kex (no KEX_IPC env set) it does nothing.
import net from "node:net"

export const KexSessionPlugin = async ({ client }) => {
  const socketPath = process.env.KEX_IPC
  const tabId = process.env.KEX_TAB_ID
  if (!socketPath || !tabId) return {}
  // One socket serves every tab of Kex: the frame names the tab and the PTY it runs on.
  const origin = { tab_id: tabId, pty_id: process.env.KEX_PTY_ID || "" }

  // Every id the plugin has registered as a main session, and the parent of each subagent
  // session it has learned about (null while the lookup is pending is never stored).
  const reported = new Set()
  const parents = new Map()
  const lookups = new Map()
  // Subagent sessions shown under the tab, until their own turn ends.
  const children = new Set()
  const working = new Set()
  // Turns that started while their session was still being registered, and the ones among
  // them that ended before registration finished (OpenCode does not await plugin handlers).
  const pending = new Set()
  const endedEarly = new Set()
  let current = ""

  const send = (frame) =>
    new Promise((resolve) => {
      try {
        const client = net.connect(socketPath)
        const finish = () => { clearTimeout(timer); client.destroy(); resolve() }
        // Arms the whole send, connect included: a listener that accepts but never
        // confirms the write must not park this handler forever.
        const timer = setTimeout(finish, 2000)
        client.on("error", finish)
        client.on("connect", () => { client.end(JSON.stringify({ ...frame, ...origin }) + "\n", finish) })
      } catch {
        resolve()
      }
    })

  const base = (id, cwd) => ({
    agent: "opencode",
    session_id: id,
    transcript_path: "",
    // The plugin host is born in the launch directory and never moves: cd inside the
    // TUI changes the session, not this process.
    cwd: cwd || process.cwd(),
  })

  // The parent of a session, from the event that created it or from a one-off lookup for a
  // session that already existed (resumed in the TUI, which fires no session.created).
  // Fails closed: when it cannot be told, the session is treated as a subagent.
  const parentOf = async (id, info) => {
    if (parents.has(id)) return parents.get(id)
    const direct = info?.parentID || info?.parent_id
    if (direct) { parents.set(id, direct); return direct }
    if (info) return ""
    if (!lookups.has(id)) {
      lookups.set(id, client.session.get({ path: { id } })
        .then((r) => (r?.data ? r.data.parentID || "" : null))
        .catch(() => null))
    }
    const parent = await lookups.get(id)
    if (parent === null) { lookups.delete(id); return "?" }
    if (parent) parents.set(id, parent)
    return parent
  }

  // Marks the session as the tab's current one before the first await, so concurrent events
  // of the same turn see it registered: OpenCode does not await plugin handlers, and a turn
  // can end before the SessionStart send returns.
  const claim = (id) => {
    const first = !reported.has(id)
    reported.add(id)
    const switched = current !== id
    current = id
    return { first, switched }
  }

  const startFrame = (id, cwd, resumed) => ({
    ...base(id, cwd),
    hook_event_name: "SessionStart",
    source: resumed ? "resume" : "startup",
  })

  // A new session in a process that already ran one is the same process (OpenCode /new), so
  // its launch line is kept; switching back to a known session re-records it as the tab's.
  const enter = async (id, info) => {
    const parent = await parentOf(id, info)
    if (parent) return false
    const alreadyRan = reported.size > 0
    const { first, switched } = claim(id)
    if (first || switched) await send(startFrame(id, info?.directory, alreadyRan))
    return true
  }

  // A subagent is a child session: it appears under the tab of its parent while it runs.
  const subagentFrame = (parent, id, info, name) => ({
    ...base(parent),
    hook_event_name: name,
    agent_id: id,
    agent_type: typeof info?.agent === "string" ? info.agent : "",
    // OpenCode titles a child session "<task description> (@<agent> subagent)".
    description: info ? String(info.title || "").replace(/\s*\(@[^)]*subagent\)\s*$/, "") || id : "",
  })

  const childStarted = async (id, info) => {
    const parent = info?.parentID || info?.parent_id
    if (!parent || children.has(id) || !reported.has(parent)) return
    children.add(id)
    await send(subagentFrame(parent, id, info, "SubagentStart"))
  }

  const childEnded = async (id) => {
    if (!children.delete(id)) return false
    const parent = parents.get(id)
    if (parent) await send(subagentFrame(parent, id, null, "SubagentStop"))
    return true
  }

  const stop = async (id) => {
    if (await childEnded(id)) return
    if (pending.has(id)) {
      endedEarly.add(id)
      return
    }
    if (!working.delete(id)) return
    if (working.size === 0) await send({ ...base(id), hook_event_name: "Stop" })
  }

  const beginTurn = async (id) => {
    if (working.has(id) || pending.has(id)) return
    pending.add(id)
    const registered = await enter(id, null)
    pending.delete(id)
    const ended = endedEarly.delete(id)
    if (!registered) return
    const wasIdle = working.size === 0
    if (!ended) working.add(id)
    if (wasIdle) await send({ ...base(id), hook_event_name: "UserPromptSubmit" })
    if (ended && wasIdle) await send({ ...base(id), hook_event_name: "Stop" })
  }

  return {
    event: async ({ event }) => {
      const type = event?.type
      const props = event?.properties || {}

      if (type === "session.created") {
        const info = props.info || props.session || props
        const id = info?.id || info?.sessionID || props.sessionID
        if (!id) return
        if (await enter(id, info)) return
        await childStarted(id, info)
        return
      }

      const id = props.sessionID
      if (!id) return

      if (type === "session.status" && props.status?.type === "idle") {
        await stop(id)
        return
      }

      if (type === "session.idle") {
        await stop(id)
        return
      }

      if (type === "session.status") {
        const status = props.status?.type
        if (status !== "busy" && status !== "retry") return
        await beginTurn(id)
        return
      }

      if (type === "permission.asked" || type === "question.asked") {
        const parent = await parentOf(id, null)
        if (parent === "?") return
        if (parent) {
          // A subagent asks on behalf of the main session the tab is showing.
          if (!reported.has(parent)) return
          await send({ ...base(parent), hook_event_name: "PermissionRequest", tool_name: type === "question.asked" ? "question" : String(props.permission || "") })
          return
        }
        if (!(await enter(id, null))) return
        await send({ ...base(id), hook_event_name: "PermissionRequest", tool_name: type === "question.asked" ? "question" : String(props.permission || "") })
        return
      }

      if (type === "session.error") {
        if (await childEnded(id)) return
        if (!reported.has(id)) return
        const error = props.error
        // Esc raises an aborted error and then goes idle: that is the user ending the turn.
        if (/Aborted/.test(String(error?.name || ""))) {
          await stop(id)
          return
        }
        working.delete(id)
        const message = error?.data?.message || error?.name || "OpenCode error"
        await send({ ...base(id), hook_event_name: "StopFailure", error_message: String(message) })
      }
    },
  }
}
