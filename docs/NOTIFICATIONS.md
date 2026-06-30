# Agent notification protocol

Kex passively monitors terminal panels for coding agents (Claude Code, Codex, etc.) using OSC sequences. PTY bytes reach two consumers in parallel: `agent_detect.rs` in the Rust PTY reader, and xterm.js in the frontend via the Tauri channel. Neither consumer removes bytes from the stream.

---

## OSC sequence reference

Format: `OSC 777;kex;<event>;<panel_id>;<session_id>;<transcript_path>;<cwd>[;<extra>]`

| Sequence | Sent by | Cuando | `agent_detect.rs` (Rust) | `osc-handlers.ts` (xterm.js) | `AgentNotificationsBridge` (TS) |
|---|---|---|---|---|---|
| `OSC 133;D;<exit>` | Shell (Kex init scripts) | Primera instrucción de `_kex_precmd`: captura `$?` antes de que se pierda | Si `armed`: `disarm()`, emit `Exited` → `kex:agent-signal` | `state.inCommand=false`, `onRunningCommand(null)` | `exited` → `store.finish()` + `invoke("agent_detach_session")` |
| `OSC 7;file://<host><path>` | Shell (Kex init scripts) | Segunda instrucción de `_kex_precmd`: justo después de `D`, antes del prompt | | Updates `panel.cwd`. Ignorado si `state.inCommand` | |
| `OSC 133;A` | Shell (Kex init scripts) | Última instrucción de `_kex_precmd`: el prompt está a punto de renderizarse | | `state.inCommand=false`, crea marker de posición del prompt | |
| `OSC 133;B` | Shell (Kex init scripts) | Incrustado en `PS1`: el shell renderizó el prompt | | `state.inCommand=true` | |
| `OSC 133;C;<cmd>` | Shell (Kex init scripts) | `_kex_preexec` (zsh) / `PS0` (bash ≥4.4): el usuario pulsó Enter, el comando va a ejecutarse | Si `match_agent(cmd)`: `armed=true`, `status=Idle`, emit `Started` → `kex:agent-signal` | `state.inCommand=true`, `onRunningCommand(cmd)` | `started` → noop |
| `OSC 9;<msg>` (sin `9;4`) | Cualquier proceso | Claude Code lo usa para notificaciones cuando no hay hooks instalados | Si `armed`: `status=Waiting`, emit `Notification` → `kex:agent-signal` | | `Notification` → `setStatus("attention")` + route (salvo si el panel ya está enfocado) |
| `OSC 777;kex;SessionStart;<panel_id>;<session_id>;<transcript_path>;<cwd>` | Hook `SessionStart` de Claude Code via `session.sh` | Claude Code inicia una nueva sesión (antes del primer prompt) | Parsea campos (todos percent-encoded), emit `SessionStart` (no llega al frontend) → `session_store::record_session` | | |
| `OSC 777;kex;UserPromptSubmit;<panel_id>;<session_id>;<transcript_path>;<cwd>` | Hook `UserPromptSubmit` de Claude Code via `session.sh` | El usuario envió un prompt | `session_store::record_session` + `ensure_armed`, `status=Working`, emit `UserPromptSubmit` → `kex:agent-signal` | | `UserPromptSubmit` → `ensureSession` + `setStatus("working")` (spinner en el tab) |
| `OSC 777;kex;Notification;<panel_id>;<session_id>;<transcript_path>;<cwd>;<type>;<msg>` | Hook `Notification` de Claude Code | Claude Code necesita input del usuario (permiso, pregunta, etc.) | Si `type == idle_prompt`: **ignorado** (ya lo cubre `Stop`). Resto: `ensure_armed`, `status=Waiting`, emit `Notification` → `kex:agent-signal` | | `Notification` → `setStatus("attention")` + route (salvo si el panel ya está enfocado) |
| `OSC 777;kex;Stop;<panel_id>;<session_id>;<transcript_path>;<cwd>` | Hook `Stop` de Claude Code | Claude Code terminó de responder y vuelve a esperar input | `ensure_armed`, `status=Waiting`, emit `Stop`, `status=Idle` (permanece armado) → `kex:agent-signal` | | `Stop` → `setStatus("attention")` (dot naranja) + route "attention", salvo si el panel ya está enfocado (entonces `idle`) |
| `OSC 777;kex;StopFailure;<panel_id>;<session_id>;<transcript_path>;<cwd>;<type>;<msg>` | Hook `StopFailure` de Claude Code | Claude Code falló con error | `status=Waiting`, emit `StopFailure` → `kex:agent-signal` | | `StopFailure` → route error + `store.finish()` + detach |
| `OSC 777;kex;SessionEnd;<panel_id>;<session_id>;<transcript_path>;<cwd>;<reason>` | Hook `SessionEnd` de Claude Code | Sesión terminó limpiamente | emit `SessionEnd` → `kex:agent-signal` | | `SessionEnd` → `store.finish()` + detach |
| `OSC 777;kex;PermissionRequest;<panel_id>;<session_id>;<transcript_path>;<cwd>;<tool>` | Hook `PermissionRequest` de Claude Code | Claude Code pide permiso para usar una herramienta | `ensure_armed`, `status=Waiting`, emit `PermissionRequest` → `kex:agent-signal` | | `PermissionRequest` → `setStatus("attention")` + route |

`OSC 133` lo emite el shell (zsh/bash via los scripts de init de Kex), no Claude Code. Cuando el usuario lanza `claude`, el shell emite `C;claude` y deja de emitir OSC 133 porque Claude Code toma el PTY. El estado working/attention durante la sesión de Claude Code se conoce exclusivamente a través de los hooks.

`OSC 9;4;...` es taskbar progress (Windows); se ignora aunque el detector esté armado.

---

## Auto-arming (`ensure_armed`)

Si llega un `OSC 777;kex;*` sin que antes haya llegado `OSC 133;C` (bash, Windows, tmux, wrappers que no emiten shell integration), `ensure_armed` arma el detector (`status=Idle`) y emite `Started { agent: "claude" }` antes de la transición real. Esto garantiza que los hooks funcionan en cualquier entorno sin depender de la shell integration.

---

## Detector state machine

```
           OSC 133;C (match_agent) — puede disparar aunque ya esté armado
Ground ─────────────────────────────► Armed/Idle
         (o ensure_armed auto-arm)         │
                                           │ OSC 777;kex;UserPromptSubmit
                                           ▼
                                    Armed/Working
                                           │
         OSC 777;kex;Notification          │ OSC 777;kex;Stop
         OSC 777;kex;PermissionRequest     ▼
         OSC 9 / OSC 777;otro             
         ──────────────────────► Armed/Waiting
                                           │
              OSC 777;kex;UserPromptSubmit │◄──── set_working (siempre emite)
              ─────────────────────────────┘
                                           │
              OSC 133;D / PTY close        ▼
              ──────────────────────► Ground (disarmed)
```

Notas clave:
- **`Stop` no desarma el detector**: Claude sigue corriendo, solo ha terminado de responder. El detector Rust queda en `Idle` listo para el siguiente prompt. En el frontend, `Stop` es el origen del dot naranja (es tu turno): pone `attention` salvo que ya estés mirando el panel.
- **El dot naranja al terminar viene de `Stop`, no de `idle_prompt`**: `idle_prompt` (un reenvío tardío que Claude puede repetir) se filtra en Rust, de modo que el fin de turno produce una sola señal de atención.
- **`set_working` siempre emite**: no hay guard de idempotencia en Rust. El store del frontend maneja duplicados. Esto es necesario para que el spinner se recupere tras un ESC/CTRL+C (el frontend borra la sesión, Rust no lo sabe, el siguiente `UserPromptSubmit` debe re-crearla).
- **`OSC 133;C` puede re-armar**: no hay guard `if armed { return }`. Si el usuario sale de Claude y lo relanza en el mismo terminal, el nuevo `133;C` re-arma correctamente.
- **Otros eventos v4**: `StopFailure`, `SessionEnd`, `PermissionRequest` llegan tras ensure_armed, mueven estado según sus semánticas, y emiten señales propias al frontend.

---

## Notification routing

`AgentNotificationsBridge` delega en `lib/route.ts`:

| Condición | Acción |
|---|---|
| Panel activo y ventana enfocada | Silencioso (el usuario ya está mirando) |
| Ventana sin foco | Notificación del sistema operativo |
| Ventana enfocada pero panel oculto | Sonner toast |

Los eventos de atención (`Notification`, `PermissionRequest`, `Stop`) se enrutan con `kind: "attention"` y permiten toast (el usuario tiene que responder). Solo `StopFailure` usa `kind: "error"`.

---

## Notification bell (una entrada por agente)

`pushNotification` hace **upsert por `panelId`**: cada agente tiene como mucho una notificación, y un evento nuevo la reutiliza y la mueve al frente (en vez de apilar duplicados). `Stop` puede repetirse y Claude puede reenviar `idle_prompt`; el filtro de `idle_prompt` en Rust mas el upsert evitan que el final de turno genere varias filas.

`NotificationBell` colapsa sesiones vivas + notificaciones en una sola lista con `buildAgentEntries` (`lib/notificationList.ts`), una fila por `panelId`, y solo muestra lo accionable. Una sesión `idle` ya se ha visto, asi que se omite. El indicador de cada fila se deriva en vivo del estado de la sesión, asi que coincide siempre con el dot del tab:

| `visual` | Origen | Indicador |
|---|---|---|
| `attention` | `session.status === "attention"` | punto ambar (igual que el tab) |
| `working` | `session.status === "working"` | spinner |
| `error` | `restoreError` o notif `error` | punto rojo |

No hay texto de estado en la fila (no cabe): solo el nombre y el indicador. El nombre es el título OSC del tab (`oscTitleStore`) con fallback al nombre del agente. Orden: `attention` primero, luego `working`, luego `error`; dentro de cada grupo, mas reciente arriba. El badge cuenta las entradas `pending` (attention + error sin leer), una vez por agente.

El popover se abre con la campana o con el shortcut `notifications.toggle` (Cmd+I por defecto, configurable en Settings → VIEW); su estado `open` vive en `bellStore` para que el shortcut global lo pueda alternar. El pie del popover tiene un botón **Clear all** (`agentStore.clearAll`) que borra las notificaciones y apaga todos los dots naranja (las sesiones `attention` pasan a `idle`; las `working` siguen). La sección de instalación de hooks solo aparece cuando los hooks no están activos.

---

## Tab UI

`PaneTabBar` lee de `agentStore`:

| Estado | Icono | Título | Indicador |
|---|---|---|---|
| Working | `✦` | `agentname · dirname` | spinner blanco |
| Attention (needs input) | `✦` | `agentname · dirname` | punto ambar |
| Finished / idle | icono del panel | título del panel | ninguno |
| Restored, sin error | `✦` | `agentname · dirname` | spinner blanco |
| Restore error | `⚠` | `agentname · dirname` (rojo) | punto rojo estático |

`dirname` es el último segmento de `panel.cwd`.

### Cuando desaparece el indicador

El dot naranja (status=attention) y el spinner (status=working) se limpian por mecanismos distintos:

| Trigger | Aplica a | Mecanismo |
|---|---|---|
| Enfocar el panel del agente | Dot naranja | `markPanelSeen` desde el efecto de foco en `AgentNotificationsBridge` |
| `Stop` con el panel ya enfocado | Spinner (pasa a `idle`, sin dot) | `setStatus("idle")` en `handleSignal` |
| `UserPromptSubmit` hook | Dot y spinner pasa a spinner | `setStatus("working")` en `handleSignal` |
| `Exited` / `SessionEnd` / `StopFailure` | Dot y spinner | `store.finish()` en `handleSignal` |
| ESC (`\x1b` solo, 1 byte) | Spinner | `writeToPty` → `setStatus("idle")` |
| CTRL+C (`\x03`) | Spinner | `writeToPty` → `setStatus("idle")` |

El dot naranja es una señal de "atención no vista": se limpia al **mirar** el panel (panel activo + ventana enfocada), no al teclear. Por eso un `Notification`/`PermissionRequest`/`Stop` que llega mientras el panel ya está enfocado no llega a poner el dot (`isPanelSeen` lo descarta en `handleSignal`); cuando es un `Stop`, el spinner pasa directo a `idle`.

El spinner refleja estado real del agente, así que solo lo limpian las interrupciones explícitas (`\x03`, `\x1b` solo). Las respuestas automáticas de xterm a queries de terminal (`\x1b[?1;2c`, etc.) son secuencias multi-byte que no coinciden y no limpian el spinner accidentalmente.

### Re-aparición del spinner tras interrupción

Cuando el usuario interrumpe (ESC/CTRL+C), el frontend borra la sesión pero el detector Rust no cambia de estado. Cuando el usuario envía el siguiente prompt, `set_working` emite `UserPromptSubmit` siempre (sin guard), `ensureSession` re-crea la sesión, y el spinner vuelve a aparecer.

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
