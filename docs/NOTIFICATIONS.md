# Agent notification protocol

Kex passively monitors terminal panels for coding agents (Claude Code, Codex, etc.) using OSC sequences. PTY bytes reach two consumers in parallel: `agent_detect.rs` in the Rust PTY reader, and xterm.js in the frontend via the Tauri channel. Neither consumer removes bytes from the stream.

---

## OSC sequence reference

| Sequence | Sent by | Cuando | `agent_detect.rs` (Rust) | `osc-handlers.ts` (xterm.js) | `AgentNotificationsBridge` (TS) |
|---|---|---|---|---|---|
| `OSC 133;D;<exit>` | Shell (Kex init scripts) | Primera instrucción de `_kex_precmd`: captura `$?` del comando que acaba de terminar antes de que se pierda | Si `armed`: `disarm()`, emit `Exited` → `kex:agent-signal` | `state.inCommand=false`, `onRunningCommand(null)` | `exited` → `store.finish()` + `invoke("agent_detach_session")` |
| `OSC 7;file://<host><path>` | Shell (Kex init scripts) | Segunda instrucción de `_kex_precmd`: justo después de `D`, antes de mostrar el prompt | | Updates `panel.cwd`. Ignored if `state.inCommand` (protects against output injection) | |
| `OSC 133;A` | Shell (Kex init scripts) | Última instrucción de `_kex_precmd`: el prompt está a punto de renderizarse | | `state.inCommand=false`, crea marker de posición del prompt | |
| `OSC 133;B` | Shell (Kex init scripts) | Incrustado en `PS1`: se emite cuando el shell renderiza el prompt y el usuario puede empezar a escribir | | `state.inCommand=true` | |
| `OSC 133;C;<cmd>` | Shell (Kex init scripts) | `_kex_preexec` (zsh) / `PS0` (bash ≥4.4): el usuario pulsó Enter, el comando va a ejecutarse. En bash <4.4 no se emite | Si `!armed` y `match_agent(cmd)`: `armed=true`, emit `Started` → `kex:agent-signal` | `state.inCommand=true`, `onRunningCommand(cmd)` | `started` → noop |
| `OSC 133;C;<cmd>` (ya armado) | Shell (Kex init scripts) | Igual que arriba, pero el detector ya estaba armado por un agente previo | Ignorado | `state.inCommand=true`, `onRunningCommand(cmd)` | |
| `OSC 9;<msg>` (sin `9;4`) | Cualquier proceso | Varía por aplicacion; Claude Code lo usa para notificaciones del sistema cuando no hay hooks instalados | Si `armed`: `status=Waiting`, emit `Notification` → `kex:agent-signal` | | `Notification` → `setStatus("waiting")` + route |
| `OSC 777;notify;Kex;UserPromptSubmit` | Hook `UserPromptSubmit` de Claude Code | El usuario envió un prompt a Claude Code (antes de que Claude empiece a procesar) | `ensure_armed`; si `status!=Working`: `status=Working`, emit `UserPromptSubmit` → `kex:agent-signal` | | `UserPromptSubmit` → `setStatus("working")` (spinner en el tab) |
| `OSC 777;notify;Kex;Notification` | Hook `Notification` de Claude Code | Claude Code generó una notificación (necesita input del usuario, solicitud de permiso, etc.) | `ensure_armed`, `status=Waiting`, emit `Notification` → `kex:agent-signal` | | `Notification` → `setStatus("waiting")` + route |
| `OSC 777;notify;Kex;Stop` | Hook `Stop` de Claude Code | Claude Code terminó de responder y vuelve a esperar input | `ensure_armed`, `status=Waiting`, emit `Stop`, `disarm()` → `kex:agent-signal` | | `Stop` → route "finished" + `store.finish()` |
| `OSC 777;kex-session;...` | Hook `SessionStart` de Claude Code via `session.sh` | Claude Code inicia una nueva sesión (antes de que el usuario envíe el primer prompt) | Parsea campos, emit `SessionStart` (no llega al frontend) → `session_store::record_session` | | |
| `OSC 777;notify;<otro>;...` | Cualquier proceso | Varía | Si `armed`: `status=Waiting`, emit `Notification` → `kex:agent-signal` | | `Notification` → `setStatus("waiting")` + route |

`OSC 133` lo emite el shell (zsh/bash via los scripts de init de Kex), no Claude Code. Cuando el usuario lanza `claude`, el shell emite `C;claude` y deja de emitir OSC 133 porque Claude Code toma el PTY. El estado working/waiting durante la sesión de Claude Code se conoce exclusivamente a través de los hooks.

`OSC 9;4;...` es taskbar progress (Windows); se ignora aunque el detector esté armado.

---

## Auto-arming (`ensure_armed`)

Si llega un `OSC 777;notify;Kex;*` sin que antes haya llegado `OSC 133;C` (bash, Windows, tmux, wrappers que no emiten shell integration), `ensure_armed` arma el detector y emite `Started { agent: "claude" }` antes de la transición real. Esto garantiza que los hooks funcionan en cualquier entorno sin depender de la shell integration.

---

## Detector state machine

```
           OSC 133;C (match_agent)
Ground ─────────────────────────────► Armed/Working
                                           │
              OSC 777;Kex;UserPromptSubmit │◄──── (si status!=Working)
              ─────────────────────────────┘
                                           │
              OSC 777;Kex;Notification     │
              OSC 9 / OSC 777;otro         ▼
              ──────────────────────► Armed/Waiting
                                           │
              OSC 777;Kex;UserPromptSubmit │◄──── set_working
              ─────────────────────────────┘
                                           │
              OSC 777;Kex;Stop             │
              OSC 133;D                    ▼
              ──────────────────────► Ground (disarmed)
```

`set_working` solo emite `UserPromptSubmit` si `status != Working`, evitando transiciones redundantes cuando llegan múltiples hooks consecutivos.

---

## Notification routing

`AgentNotificationsBridge` delega en `lib/route.ts`:

| Condición | Acción |
|---|---|
| Panel activo y ventana enfocada | Silencioso (el usuario ya está mirando) |
| Ventana sin foco | Notificación del sistema operativo |
| Ventana enfocada pero panel oculto | Sonner toast |

Solo `Notification` genera toast (el usuario necesita hacer algo). `Stop` genera solo OS notify o bell, nunca toast.

---

## Tab UI

`PaneTabBar` lee de `agentStore`:

| Estado | Icono | Título | Indicador |
|---|---|---|---|
| Working | `✦` | `agentname · dirname` | spinner blanco |
| Waiting (needs input) | `✦` | `agentname · dirname` | punto ambar |
| Finished / idle | icono del panel | título del panel | ninguno |
| Restored, sin error | `✦` | `agentname · dirname` | spinner blanco |
| Restore error | `⚠` | `agentname · dirname` (rojo) | punto rojo estático |

`dirname` es el último segmento de `panel.cwd`.

El indicador se limpia con el primero de estos eventos:
- `Stop` signal: el hook `Stop` de Claude Code disparó normalmente.
- `Exited` signal: `OSC 133;D` o PTY cerrado.
- El usuario escribe en el terminal: `writeToPty` llama a `store.finish()` cuando hay sesión activa (cubre Ctrl+C y terminaciones anómalas sin necesidad de timer).

---

## Zero cost when idle

El detector corre enteramente en el filtro de bytes del PTY. Cuando no hay ningún agente corriendo no se realiza ningún trabajo extra; no hay timers ni peticiones en background.

---

## Installing hooks

Hooks can be installed from the notification bell popover. `agent_enable_claude_hooks`:
- Reads `~/.claude/settings.json` atomically
- Injects hook entries for `UserPromptSubmit`, `Notification`, `Stop`, and `SessionStart` without touching unrelated settings
- Is idempotent — safe to run on an already-configured installation
- On every startup, if `agentNotifications` is true, runs silently to repair missing or outdated hooks

See `docs/AGENT_SESSION_RESTORE.md` for the session persistence hooks (`SessionStart`, `session.sh`).
