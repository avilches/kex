# Agent notification protocol

Kex monitors terminal panels for coding agents (Claude Code, Codex, etc.) through two independent channels that both
end up emitting `kex:agent-signal` to the frontend, but never touch each other:

1. **OSC bytes in the PTY stream.** `agent_detect.rs` in the Rust PTY reader watches for `OSC 133` (shell
   integration) and `OSC 9` (Claude Code's built-in fallback notification). xterm.js in the frontend sees the same
   bytes in parallel via the Tauri channel. Neither consumer removes bytes from the stream.
2. **Claude Code hook JSON over a Unix socket, one per PTY.** `trigger-event.sh` forwards the hook's payload
   unmodified to `pty/ipc.rs::run_listener`, which parses it directly and emits `kex:agent-signal` (or, for
   `SessionStart`, records the session first). This path is entirely out of band from the PTY byte stream: it never
   passes through `agent_detect.rs`, and it does not touch the OSC-driven `armed`/`status` state kept there. See
   `docs/AGENT_SESSION_RESTORE.md` for the hook script and socket details.

A previous version of the hook script (`kex-session-hook`, before it was renamed `trigger-event.sh`) fed its JSON
through channel 1 instead, encoded as a single `OSC 777;kex;...` sequence and parsed by `agent_detect.rs`. That
parser (`handle_kex_unified`, still tested) is kept in the code but nothing emits that sequence anymore; treat it as
legacy/dead, not a live path (see TASK-733 for the decision on deleting it).

---

## OSC sequence reference (channel 1: PTY bytes)

| Sequence | Sent by | Cuando | `agent_detect.rs` (Rust) | `osc-handlers.ts` (xterm.js) | `AgentNotificationsBridge` (TS) |
|---|---|---|---|---|---|
| `OSC 133;D;<exit>` | Shell (Kex init scripts) | Primera instrucción de `_kex_precmd`: captura `$?` antes de que se pierda | Si `armed`: `disarm()`, emit `Exited` → `kex:agent-signal` | `state.inCommand=false`, `onRunningCommand(null)` | `exited` → `store.finish()` + `invoke("agent_detach_session")` |
| `OSC 7;file://<host><path>` | Shell (Kex init scripts) | Segunda instrucción de `_kex_precmd`: justo después de `D`, antes del prompt | | Updates `panel.cwd`. Ignorado si `state.inCommand` | |
| `OSC 133;A` | Shell (Kex init scripts) | Última instrucción de `_kex_precmd`: el prompt está a punto de renderizarse | | `state.inCommand=false`, crea marker de posición del prompt | |
| `OSC 133;B` | Shell (Kex init scripts) | Incrustado en `PS1`: el shell renderizó el prompt | | `state.inCommand=true` | |
| `OSC 133;C;<cmd>` | Shell (Kex init scripts) | `_kex_preexec` (zsh) / `PS0` (bash ≥4.4): el usuario pulsó Enter, el comando va a ejecutarse | Si `match_agent(cmd)`: `armed=true`, `status=Idle`, emit `Started` → `kex:agent-signal` | `state.inCommand=true`, `onRunningCommand(cmd)` | `started` → noop |
| `OSC 9;<msg>` (sin `9;4`) | Cualquier proceso | Claude Code lo usa para notificaciones cuando no hay hooks instalados | Si `armed`: `status=Waiting`, emit `Notification` → `kex:agent-signal` | | `Notification` → `setStatus("attention")` + route (salvo si el panel ya está enfocado) |

`OSC 133` lo emite el shell (zsh/bash via los scripts de init de Kex), no Claude Code. Cuando el usuario lanza `claude`, el shell emite `C;claude` y deja de emitir OSC 133 porque Claude Code toma el PTY: a partir de ahí, `armed`/`status` en `agent_detect.rs` ya no avanzan (solo `OSC 9` y `OSC 133;D` los tocan); el estado working/attention real durante la sesión se conoce a través del canal 2, más abajo.

`OSC 9;4;...` es taskbar progress (Windows); se ignora aunque el detector esté armado.

---

## Unix socket hook events (channel 2)

`trigger-event.sh` reenvía el JSON del hook tal cual a `$KEX_IPC`. `pty/ipc.rs::dispatch` lo parsea y actúa
directamente, sin pasar por `agent_detect.rs`:

| `hook_event_name` | Cuando | `ipc.rs::dispatch` (Rust) | `AgentNotificationsBridge` (TS) |
|---|---|---|---|
| `SessionStart` | Claude Code inicia una nueva sesión, incluida una reanudada con `--resume` (payload `source`) | `session_store::record_session(...)`, emit `kex:agent-session-meta` (no llega a `kex:agent-signal`) | (ninguno; solo alimenta la restauración de sesión) |
| `UserPromptSubmit` | El usuario envió un prompt | emit `kex:agent-signal` `kind: "UserPromptSubmit"` | `ensureSession` + `setStatus("working")` (spinner en el tab) |
| `Notification` | Claude Code necesita input del usuario (permiso, pregunta, etc.) | Si `notification_type == idle_prompt`: **ignorado** (ya lo cubre `Stop`). Resto: emit `kex:agent-signal` `kind: "Notification"` | `setStatus("attention")` + route (salvo si el panel ya está enfocado) |
| `Stop` | Claude Code terminó de responder y vuelve a esperar input | emit `kex:agent-signal` `kind: "Stop"` | Si panel enfocado: `setStatus("idle")`. Si no: `setStatus("attention")` (dot naranja) + route "attention" |
| `StopFailure` | Claude Code falló con error | emit `kex:agent-signal` `kind: "StopFailure"` | route error + `store.finish()` + detach |
| `SessionEnd` | Sesión terminó limpiamente | emit `kex:agent-signal` `kind: "SessionEnd"` | `store.finish()` + detach |
| `PermissionRequest` | Claude Code pide permiso para usar una herramienta | emit `kex:agent-signal` `kind: "PermissionRequest"` | `setStatus("attention")` + route |
| `MessageDisplay` | Mensaje final de un turno (campos por confirmar) | Si `final` es falso, ignorado; si es verdad, emit `kex:agent-signal` `kind: "MessageDisplay"` | `ensureSession` (sin efecto adicional hoy) |

Ningún evento de este canal arma ni desarma `agent_detect.rs`: `armed`/`status` ahí solo reaccionan a `OSC 133`/`OSC 9`
(canal 1). El estado `working`/`attention`/`idle` que ve el usuario vive enteramente en `agentStore` del frontend,
actualizado por `handleSignal` en `AgentNotificationsBridge.tsx` a partir de estos eventos.

---

## Auto-arming (`ensure_armed`), legado

`ensure_armed` solo lo llama `handle_kex_unified`, el parser del extinto `OSC 777;kex;*` (ver arriba). Con ese canal
muerto, `ensure_armed` es código sin ninguna ruta de entrada viva hoy: no arma nada a partir de los eventos del
socket Unix, que nunca pasan por `agent_detect.rs`.

---

## Detector state machine

El único estado que mantiene hoy `agent_detect.rs` es el de armado/desarmado del canal 1 (OSC), no el ciclo
working/waiting completo:

```
OSC 133;C (match_agent)
Ground ──────────────────► Armed
                              │
       OSC 133;D / PTY close │
       ─────────────────────►┘
                              ▼
                           Ground (disarmed)
```

Mientras está `Armed`, `OSC 9` sigue produciendo una señal `Notification` genérica (sin `session_id`, para cuando
Claude Code no tiene hooks instalados). El resto de transiciones que antes vivían en este mismo diagrama
(`Working`/`Waiting` por `UserPromptSubmit`/`Notification`/`Stop`/etc.) ya no las lleva Rust: las decide directamente
`agentStore` en el frontend a partir de los eventos del canal 2, uno por uno, según la tabla de la sección anterior.

Notas clave:
- **`Stop` no cierra la sesión**: Claude sigue corriendo, solo ha terminado de responder. En el frontend, `Stop` es
  el origen del dot naranja (es tu turno): pone `attention` salvo que ya estés mirando el panel, en cuyo caso pasa a
  `idle` directamente.
- **El dot naranja al terminar viene de `Stop`, no de `idle_prompt`**: `idle_prompt` (un reenvío tardío que Claude
  puede repetir) se filtra en `ipc.rs::dispatch`, de modo que el fin de turno produce una sola señal de atención.
- **No hay guard de idempotencia en el socket**: cada `UserPromptSubmit` se reenvía tal cual llega. El store del
  frontend maneja duplicados. Esto es necesario para que el spinner se recupere tras un ESC/CTRL+C (el frontend
  borra la sesión, Rust no lo sabe, el siguiente `UserPromptSubmit` debe re-crearla vía `ensureSession`).
- **`OSC 133;C` puede re-armar el canal 1**: no hay guard `if armed { return }`. Si el usuario sale de Claude y lo
  relanza en el mismo terminal, el nuevo `133;C` re-arma correctamente, independientemente del estado del canal 2.

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

Cuando el usuario interrumpe (ESC/CTRL+C), el frontend borra la sesión pero nada en el socket Unix ni en Rust se
entera. Cuando el usuario envía el siguiente prompt, `trigger-event.sh` reenvía el `UserPromptSubmit` como siempre
(sin guard de por medio), `ensureSession` re-crea la sesión en el frontend, y el spinner vuelve a aparecer.

---

## Zero cost when idle

El detector del canal 1 corre enteramente en el filtro de bytes del PTY. El listener del canal 2 (un hilo por PTY,
bloqueado en `accept()`) tampoco hace trabajo mientras no llega ningún hook. En ninguno de los dos casos hay timers
ni peticiones en background cuando no hay ningún agente corriendo.

---

## Installing hooks

Hooks can be installed from the notification bell popover. `agent_enable_claude_hooks`:
- Reads `~/.claude/settings.json` atomically
- Injects hook entries for all 8 events handled by `trigger-event.sh` (`SessionStart`, `UserPromptSubmit`,
  `Notification`, `Stop`, `StopFailure`, `SessionEnd`, `PermissionRequest`, `MessageDisplay`) without touching
  unrelated settings
- Is idempotent, safe to run on an already-configured installation
- On every startup, if `agentNotifications` is true, runs silently to repair missing or outdated hooks

See `docs/AGENT_SESSION_RESTORE.md` for the session persistence hooks (`SessionStart`, `trigger-event.sh`).
