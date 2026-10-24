# Agent notification protocol

Kex monitors terminal panels for coding agents (Claude Code, Codex, etc.) through two independent channels that both
end up emitting `kex:agent-signal` to the frontend, but never touch each other:

1. **OSC bytes in the PTY stream.** `agent_detect.rs` in the Rust PTY reader watches for `OSC 133` (shell
   integration) and `OSC 9` (Claude Code's built-in fallback notification). xterm.js in the frontend sees the same
   bytes in parallel via the Tauri channel. Neither consumer removes bytes from the stream.
2. **Claude Code hook JSON over one Unix socket for the whole app.** `trigger-event.sh` forwards the hook's payload,
   tagged with its `tab_id` and `pty_id`, to the single listener in `pty/ipc.rs`, which routes it to the tab and parses it directly and emits `kex:agent-signal` (or, for
   `SessionStart`, records the session first). This path is entirely out of band from the PTY byte stream: it never
   passes through `agent_detect.rs`, and it does not touch the OSC-driven `armed` state kept there. See
   `docs/AGENT_SESSION_RESTORE.md` for the hook script and socket details.

---

## Resumen: todos los avisos

Una sola tabla con cada cosa que Kex le enseña al usuario sobre un agente. El detalle de cada fila esta en las secciones
de abajo; las pruebas manuales, en el bloque M de `docs/RESTORE_SESSION_TESTS.md`.

Salvo la ultima fila, todo lo que sigue necesita que la integracion del agente este instalada (ver "Install reminder"),
porque son los hooks y las extensiones los que avisan de que el agente trabaja, pide permiso o termina.

| Aviso | Que es | Cuando aparece | Cuando desaparece |
|---|---|---|---|
| Spinner del tab | Rueda en el tab del agente (estilo `arc`, `braille` o `cursor`, en Settings > Appearance) | El agente trabaja: `UserPromptSubmit`, o un `Stop` con subagentes en segundo plano todavia vivos | Cuando el agente termina el turno (`Stop`), con ESC o CTRL+C, o al salir el agente |
| Punto ambar del tab | Punto fijo de 6 px, no pulsa | El agente necesita al usuario: `Notification`, `PermissionRequest` o `Stop` (fin de turno), siempre que el tab no se este mirando | Al mirar el tab (tab activo y ventana con foco), en cuanto llega un prompt nuevo, o al salir el agente. "Clear all" de la campana tambien lo apaga |
| Punto rojo del tab | Punto fijo de 6 px | La restauracion de la sesion fallo, o la sesion estaba trabajando cuando se cerro Kex (interrumpida) | Un fallo de restauracion, al abrir una shell normal o reintentar; una sesion interrumpida, con la siguiente actividad del agente |
| Fila en la campana | Una fila por tab con algo accionable, con el mismo indicador que el tab. El numero de la campana cuenta los pendientes (atencion y error sin leer) | Con el spinner, el punto ambar o el rojo | Cuando el indicador desaparece. Se marca como leido al abrir el popover |
| Toast de atencion | Aviso dentro de Kex con el titulo "<nombre> needs your input", 15 s, boton "Open" que lleva al tab | Solo para atencion (`Notification`, `PermissionRequest`, `Stop`), con la ventana de Kex con foco pero mirando otro tab | Se cierra solo a los 15 s o con la X. Un fallo (`StopFailure`) no saca toast, solo aviso del sistema o campana |
| Aviso del sistema operativo | Notificacion del SO con el titulo "<nombre> needs your input" o, si el turno fallo, "<nombre> stopped with an error"; en macOS, al hacer clic activa la ventana y el tab | La ventana de Kex NO tiene foco | Lo gestiona el SO |
| Toast de instalacion | "<Agente> is running without the Kex integration", boton Install, 20 s | Al detectar el agente sin integracion; como mucho dos veces por agente, la segunda a los 15 dias | Se cierra a los 20 s, con la X, o al instalar |

Reglas que atraviesan todas las filas:

- **Si el tab se esta mirando, no se avisa de nada.** Tab activo y ventana con foco: ni toast, ni aviso del SO, ni
  fila en la campana (`route.ts` y `isTabSeen`).
- **No hay ningun interruptor de avisos en Settings.** `agentNotifications` existe en `settings-general.json` y vale
  `true` por defecto, pero no se edita desde la interfaz: solo cambia como efecto de instalar o desinstalar la
  integracion de Claude Code. Con el valor a `false`, `route.ts` no manda ningun toast, ni aviso del SO, ni fila de
  campana; el spinner y los puntos del tab siguen funcionando.
- **El spinner y los puntos no son avisos "enrutados":** los pinta el estado de la sesion (`agentStore`), asi que
  salen aunque estes mirando el tab. El filtro de arriba solo afecta a los toast, al SO y a la campana.
- **Un fin de turno no se llama "finished".** `route()` acepta `"finished"` pero nada lo usa: `Stop` se enruta como
  atencion, asi que el titulo es siempre "needs your input" (y `<nombre>` es el nombre que le puso el usuario al tab, o
  el titulo OSC, o el nombre del agente).
- **La campana** se abre con el icono del header o con el atajo `notifications.toggle` (Cmd+Shift+I por defecto,
  reasignable en Settings > Shortcuts).

---

## OSC sequence reference (channel 1: PTY bytes)

| Sequence | Sent by | Cuando | `agent_detect.rs` (Rust) | `osc-handlers.ts` (xterm.js) | `AgentNotificationsBridge` (TS) |
|---|---|---|---|---|---|
| `OSC 133;D;<exit>` | Shell (Kex init scripts) | Primera instrucción de `_kex_precmd`: captura `$?` antes de que se pierda | Si `armed`: `disarm()`, emit `Exited` → `kex:agent-signal` | `state.inCommand=false`, `onRunningCommand(null)` | `exited` → `store.finish()` + `invoke("agent_detach_session")` |
| `OSC 7;file://<host><path>` | Shell (Kex init scripts) | Segunda instrucción de `_kex_precmd`: justo después de `D`, antes del prompt | | Updates `panel.cwd`. Ignorado si `state.inCommand` | |
| `OSC 133;A` | Shell (Kex init scripts) | Última instrucción de `_kex_precmd`: el prompt está a punto de renderizarse | | `state.inCommand=false`, crea marker de posición del prompt | |
| `OSC 133;B` | Shell (Kex init scripts) | Incrustado en `PS1`: el shell renderizó el prompt | | `state.inCommand=true` | |
| `OSC 133;C;<cmd>` | Shell (Kex init scripts) | `_kex_preexec` (zsh) / `PS0` (bash ≥4.4): el usuario pulsó Enter, el comando va a ejecutarse | Si `find_agent_invocation(cmd)` encuentra un segmento cuya palabra de orden es un agente: `armed=true`, emit `Started` → `kex:agent-signal` | `state.inCommand=true`, `onRunningCommand(cmd)` | `started` → `ensureSessionIdle` y `suggestIntegration` (ver "Install reminder") |
| `OSC 9;<msg>` (sin `9;4`) | Cualquier proceso | Claude Code lo usa para notificaciones cuando no hay hooks instalados | Si `armed`: emit `Notification` → `kex:agent-signal` | | `Notification` → `setStatus("attention")` + route (salvo si el panel ya está enfocado) |

`OSC 133` lo emite el shell (zsh/bash via los scripts de init de Kex), no Claude Code. Cuando el usuario lanza `claude`, el shell emite `C;claude` y deja de emitir OSC 133 porque Claude Code toma el PTY: a partir de ahí, `armed` en `agent_detect.rs` ya no avanza (solo `OSC 9` y `OSC 133;D` lo tocan); el estado working/attention real durante la sesión se conoce a través del canal 2, más abajo.

`OSC 9;4;...` es taskbar progress (Windows); se ignora aunque el detector esté armado.

---

## Unix socket hook events (channel 2)

`trigger-event.sh` reenvía el JSON del hook a `$KEX_IPC`, el socket único de la app, con `tab_id` y `pty_id` sacados de su entorno. `pty/ipc.rs::dispatch` lo parsea y actúa
directamente, sin pasar por `agent_detect.rs`:

| `hook_event_name` | Cuando | `ipc.rs::dispatch` (Rust) | `AgentNotificationsBridge` (TS) |
|---|---|---|---|
| `SessionStart` | Claude Code inicia una nueva sesión, incluida una reanudada con `--resume` (payload `source`) | `session_store::record_session(...)`, emit `kex:agent-session-meta` (no llega a `kex:agent-signal`; el payload lleva `launchKnown`) | `handleSessionMeta`: crea la sesión idle del tab si no existía (icono desde el arranque, aunque ningún OSC 133;C reconociera el lanzador) y guarda `launchKnown`; con `false` el icono sale tachado |
| `UserPromptSubmit` | El usuario envió un prompt | emit `kex:agent-signal` `kind: "UserPromptSubmit"` | `ensureSession` + `setStatus("working")` (spinner en el tab) |
| `Notification` | Claude Code necesita input del usuario (permiso, pregunta, etc.) | Si `notification_type == idle_prompt`: **ignorado** (ya lo cubre `Stop`). Resto: emit `kex:agent-signal` `kind: "Notification"` | `setStatus("attention")` + route (salvo si el panel ya está enfocado) |
| `Stop` | Claude Code terminó de responder y vuelve a esperar input | emit `kex:agent-signal` `kind: "Stop"`, con `backgroundSubagents` (los subagentes en segundo plano que siguen vivos) | `reconcileSubagents` y luego `stopOutcome` (`lib/subagentGate.ts`): con algún subagente vivo, `setStatus("working")` y nada más. Sin ninguno: si panel enfocado, `setStatus("idle")`; si no, `setStatus("attention")` (dot naranja) + route "attention" |
| `SubagentStart` / `SubagentStop` | Claude Code lanza o termina un subagente | emit `kex:agent-signal` con `agentId` y `agentType` | `subagentStarted` / `subagentStopped` (registro `subagents` de la sesión); no cambian el estado. Al acabar el último, Claude abre un turno nuevo y su `Stop` es el que pone el dot |
| `StopFailure` | Claude Code falló con error | emit `kex:agent-signal` `kind: "StopFailure"` | route error + `store.finish()` + detach |
| `SessionEnd` | Sesión terminó limpiamente | emit `kex:agent-signal` `kind: "SessionEnd"` | `store.finish()` + detach |
| `PermissionRequest` | Claude Code pide permiso para usar una herramienta | emit `kex:agent-signal` `kind: "PermissionRequest"` | `setStatus("attention")` + route |
| `PostCompact` | Termina un `/compact` (Claude Code 2.1.76 o posterior; payload `trigger` manual o auto) | emit `kex:agent-signal` `kind: "PostCompact"` con `trigger` | Un compact manual no emite `Stop`, así que deja la pestaña en `idle` (o `working` si quedan subagentes vivos), sin notificar. Uno `auto` ocurre dentro de un turno cuyo `Stop` aún llega: se ignora |
| `MessageDisplay` | Mensaje final de un turno (campos por confirmar) | Si `final` es falso, ignorado; si es verdad, emit `kex:agent-signal` `kind: "MessageDisplay"` | `ensureSession` (sin efecto adicional hoy) |

Ningún evento de este canal arma ni desarma `agent_detect.rs`: `armed` ahí solo reacciona a `OSC 133`/`OSC 9`
(canal 1). El estado `working`/`attention`/`idle` que ve el usuario vive enteramente en `agentStore` del frontend,
actualizado por `handleSignal` en `AgentNotificationsBridge.tsx` a partir de estos eventos.

---

## Detector state machine

El único estado que mantiene hoy `agent_detect.rs` es el de armado/desarmado del canal 1 (OSC), no el ciclo
working/waiting completo:

```
OSC 133;C (find_agent_invocation)
Ground ──────────────────► Armed
                              │
       OSC 133;D / PTY close │
       ─────────────────────►┘
                              ▼
                           Ground (disarmed)
```

Mientras está `Armed`, `OSC 9` (y cualquier `OSC 777` que no sea el progreso de taskbar) sigue produciendo una señal
`Notification` genérica (sin `session_id`, para cuando Claude Code no tiene hooks instalados). El ciclo
`working`/`attention`/`idle` no lo lleva Rust: lo decide `agentStore` en el frontend a partir de los eventos del
canal 2, uno por uno, según la tabla de la sección anterior.

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

`pushNotification` hace **upsert por `tabId`**: cada agente tiene como mucho una notificación, y un evento nuevo la reutiliza y la mueve al frente (en vez de apilar duplicados). `Stop` puede repetirse y Claude puede reenviar `idle_prompt`; el filtro de `idle_prompt` en Rust mas el upsert evitan que el final de turno genere varias filas.

`NotificationBell` colapsa sesiones vivas + notificaciones en una sola lista con `buildAgentEntries` (`lib/notificationList.ts`), una fila por `tabId`, y solo muestra lo accionable. Una sesión `idle` ya se ha visto, asi que se omite. El indicador de cada fila se deriva en vivo del estado de la sesión, asi que coincide siempre con el dot del tab:

| `visual` | Origen | Indicador |
|---|---|---|
| `attention` | `session.status === "attention"` | punto ambar (igual que el tab) |
| `working` | `session.status === "working"` | spinner |
| `error` | `restoreError` o notif `error` | punto rojo |

No hay texto de estado en la fila (no cabe): solo el nombre y el indicador. El nombre es el título OSC del tab (`oscTitleStore`) con fallback al nombre del agente. Orden: `attention` primero, luego `working`, luego `error`; dentro de cada grupo, mas reciente arriba. El badge cuenta las entradas `pending` (attention + error sin leer), una vez por agente.

El popover se abre con la campana o con el shortcut `notifications.toggle` (Cmd+Shift+I por defecto, configurable en Settings > Shortcuts, grupo View); su estado `open` vive en `bellStore` para que el shortcut global lo pueda alternar. El pie del popover tiene un botón **Clear all** (`agentStore.clearAll`) que borra las notificaciones y apaga todos los dots naranja (las sesiones `attention` pasan a `idle`; las `working` siguen). Al final del popover hay una fila "Install ... integration" por agente, y solo aparece mientras esa integración falta: la de Claude Code cuando sus hooks no están activos, y las de OpenCode, OMP, Pi y Codex cuando su fichero no está instalado. Un Codex cuya config Kex no puede leer o editar sale como una fila sin botón que lo explica, y uno sin carpeta de Codex no sale. Una vez instalada, Settings > General > Agents es el único sitio para desinstalar.

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
| Interrumpido (estaba `working` al cerrar Kex) | `✦` | `agentname · dirname` | punto rojo estático hasta la siguiente actividad del agente |

El snapshot de `agent-sessions.json` guarda `"interrupted"` en `notification` cuando la sesión está `working` (o ya marcada). Al restaurar, `applyStagedSnapshot` llama a `markInterrupted`; `setStatus` limpia la marca.

`dirname` es el último segmento de `panel.cwd`.

### Cuando desaparece el indicador

El dot naranja (status=attention) y el spinner (status=working) se limpian por mecanismos distintos:

| Trigger | Aplica a | Mecanismo |
|---|---|---|
| Enfocar el panel del agente | Dot naranja | `markTabSeen` desde el efecto de foco en `AgentNotificationsBridge` |
| `Stop` con el panel ya enfocado | Spinner (pasa a `idle`, sin dot) | `setStatus("idle")` en `handleSignal` |
| `UserPromptSubmit` hook | Dot y spinner pasa a spinner | `setStatus("working")` en `handleSignal` |
| `Exited` / `SessionEnd` / `StopFailure` | Dot y spinner | `store.finish()` en `handleSignal` |
| ESC (`\x1b` solo, 1 byte) | Spinner | `writeToPty` → `setStatus("idle")` |
| CTRL+C (`\x03`) | Spinner | `writeToPty` → `setStatus("idle")` |

El dot naranja es una señal de "atención no vista": se limpia al **mirar** el panel (panel activo + ventana enfocada), no al teclear. Por eso un `Notification`/`PermissionRequest`/`Stop` que llega mientras el panel ya está enfocado no llega a poner el dot (`isTabSeen` lo descarta en `handleSignal`); cuando es un `Stop`, el spinner pasa directo a `idle`. Al mirar el panel con subagentes en segundo plano todavía vivos, el dot se limpia pero la sesión vuelve a `working` y no a `idle` (`markTabSeen`). Un `SessionEnd` (por ejemplo `/clear`) olvida los subagentes de la sesión y, si seguía en `working`, la pasa a `idle` (`forgetSubagents`).

El spinner refleja estado real del agente, así que solo lo limpian las interrupciones explícitas (`\x03`, `\x1b` solo). Las respuestas automáticas de xterm a queries de terminal (`\x1b[?1;2c`, etc.) son secuencias multi-byte que no coinciden y no limpian el spinner accidentalmente.

### Re-aparición del spinner tras interrupción

Cuando el usuario interrumpe (ESC/CTRL+C), el frontend borra la sesión pero nada en el socket Unix ni en Rust se
entera. Cuando el usuario envía el siguiente prompt, `trigger-event.sh` reenvía el `UserPromptSubmit` como siempre
(sin guard de por medio), `ensureSession` re-crea la sesión en el frontend, y el spinner vuelve a aparecer.

---

## Zero cost when idle

El detector del canal 1 corre enteramente en el filtro de bytes del PTY. El listener del canal 2 (un unico hilo para toda la app,
bloqueado en `accept()`) tampoco hace trabajo mientras no llega ningún hook. En ninguno de los dos casos hay timers
ni peticiones en background cuando no hay ningún agente corriendo.

---

## Installing hooks

Hooks can be installed from the notification bell popover. `agent_enable_claude_hooks`:
- Reads `~/.claude/settings.json` atomically
- Injects hook entries for the events of `trigger-event.sh` that the installed Claude Code knows (up to 11: `SessionStart`,
  `UserPromptSubmit`, `Notification`, `Stop`, `StopFailure`, `SessionEnd`, `PermissionRequest`, `MessageDisplay`,
  `SubagentStart`, `SubagentStop`, `PostCompact`; see `docs/AGENT_SESSION_RESTORE.md`) without touching unrelated settings
- Is idempotent, safe to run on an already-configured installation
- On every startup, if `agentNotifications` is true, runs silently to repair missing or outdated hooks

See `docs/AGENT_SESSION_RESTORE.md` for the session persistence hooks (`SessionStart`, `trigger-event.sh`).

---

## Install reminder

How Kex reminds the user to install an agent integration. Without it the spinner, the attention dot, the finish
notification and the session restore do not work for that agent, and nothing else in the app says so: Settings > General
> Agents and the bell only help a user who already went looking.

There is one reminder, a toast, driven by the `started` signal. That signal comes from channel 1, not from the hooks: it
is emitted by `agent_detect.rs` when the `OSC 133;C` command line names one of `DEFAULT_AGENTS` (`claude`, `codex`,
`opencode`, `omp`, `pi`), which is why it works before any integration exists and why it needs no hook to fire.
`handleSignal` in `AgentNotificationsBridge.tsx` calls `suggestIntegration(agent)` and nothing else in the app does.
A launcher script whose command line does not name one of those agents triggers nothing, and neither does a print-mode
run (`claude -p`), which `agent_detect.rs` skips.

Claude Code is the exception in practice. `agentNotifications` is on by default and `main.tsx` calls
`agent_enable_claude_hooks` on every startup while it is on, so for Claude Code the reminder only appears for a user who
turned that setting off, or whose `~/.claude/settings.json` could not be written. The other agents are never installed
by Kex on its own, so they are where the reminder does its work.

### The toast (asked at most twice per agent)

A Sonner toast, "<Agent> is running without the Kex integration", with an **Install** button (runs `installAgent`, then a
success or error toast). It has a close button and lasts 20 s; closing it or letting it expire is the "not now". There is
no second button and no marker in the tab: once the toast is gone nothing in the tab strip says the integration is
missing, and the user can still install from Settings > General > Agents or from the bell. The toast is 480 px wide,
capped to the viewport, because Sonner anchors it to the right edge and the text does not fit in the default width. It
carries a fixed id per agent (`integration-<agent>`).

When it appears, per agent:

| Situation | Toast |
|---|---|
| Never asked before | Yes. The ask is recorded when the toast shows, whatever the user does with it |
| Asked once, less than 15 days ago (`SUGGESTION_RETRY_MS`) | No |
| Asked once, 15 days or more ago | Yes, the second and last time |
| Asked twice | Never again |
| Integration installed at any moment | Never again, even if it is removed later |
| Integration already installed when the agent is detected | No, and it is recorded as installed, so removing it later does not bring the toast back |
| Status is not `missing` (`malformed`, `uneditable`, `unavailable`: a Codex config Kex cannot parse or edit safely, or a Codex folder that does not exist yet) | No, and no ask is recorded: Install would fail, so the next app run looks again |
| Second tab starting the same agent in the same app run | No: each agent is looked at once per run |

Cuanto molesta, en cifras. Por agente, y solo si su integracion falta:

- Como mucho **dos toasts en toda la vida del usuario**: el primero la primera vez que se detecta el agente, y el segundo
  a los 15 dias o mas del primero, la siguiente vez que lo lance. No hay un tercero, ni "mas tarde" indefinido.
- Dentro de una misma ejecucion de Kex, **uno como mucho**, aunque abra diez tabs con ese agente.
- Cada toast dura 20 s y se va solo, o antes con la X. No se queda en pantalla ni vuelve a salir por pasar el raton por
  ningun sitio (ya no hay icono en el tab).
- Con cinco agentes sin integracion, el peor caso son cinco toasts distintos, uno por agente, repartidos en el tiempo
  segun cuando los lance; cada uno con el mismo limite de dos.
- La pregunta se anota **al mostrar el toast, no al verlo**. Si Kex esta en segundo plano, o el usuario no estaba mirando
  la esquina inferior derecha, cuenta igual como pregunta hecha. Es la parte que mas puede "gastar" una de las dos
  oportunidades sin que el usuario se entere.
- "Para siempre" solo lo da instalarla: al instalar (por cualquier via) no vuelve a preguntar nunca, ni siquiera tras
  desinstalarla. No hay un boton de "no volver a preguntar": cerrar el toast cuenta como "mas tarde", y a la segunda
  vez ya no hay mas.

"Installed at any moment" means any path: the toast, Settings, the bell. They all go through `installAgent`
(`lib/agentIntegration.ts`), the single install path, which records `installedOnce` after the write succeeded (a failure
to record it is only logged, since the install itself worked). The startup repair of Claude Code hooks in `main.tsx`
calls `agent_enable_claude_hooks` directly and records nothing; the next `started` signal then finds the status
`installed` and records it.

### Where it lives

| Piece | File |
|---|---|
| Rules: `shouldSuggest`, `withAsked`, `withInstalled`, `parseSuggestions`, `SUGGESTION_RETRY_MS` (pure) | `modules/agents/lib/integrationSuggestion.ts` |
| Flow: once per run, status check, ask policy (injected dependencies, tested) | `modules/agents/lib/integrationSuggestionFlow.ts` |
| Toast, real dependencies, `suggestIntegration` | `modules/agents/components/IntegrationSuggestionToast.tsx` |
| Single install path, records `installedOnce` | `modules/agents/lib/agentIntegration.ts` |

The record is `integrationSuggestions` in `settings-general.json`, per agent:
`{ "asks": 1, "lastAskedAt": 1761000000000, "installedOnce": false }`. It is read and written through
`readIntegrationSuggestions` / `updateIntegrationSuggestions`. The main window (the toast) and the Settings window (an
install there) both write it. `updateIntegrationSuggestions` reads, changes and writes in one step behind a promise
queue, but the queue is a module variable and each webview has its own, so it orders the writes of one window and does
not make two windows writing at the same moment safe; in practice that is a click in Settings overlapping a toast, and
it can lose one of the two flags. An entry left over from the removed tab marker (`markerDismissed`) is ignored and
dropped the next time the agent's entry is written. To see the toast again while testing, delete the agent's entry; to
see the second ask, set its `lastAskedAt` more than 15 days back. Manual test plan: block L in
`docs/RESTORE_SESSION_TESTS.md`.
