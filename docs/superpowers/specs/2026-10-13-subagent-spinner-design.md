# Spinner mientras haya subagentes en segundo plano (TASK-822)

## Problema

Cuando el agente principal de Claude Code lanza subagentes en segundo plano y termina su turno, el hook `Stop` pasa la sesion a `attention` (punto amarillo y notificacion) y el spinner desaparece, aunque los subagentes sigan trabajando. Kex no registra ningun hook de subagente.

Esta es la primera de dos entregas. La segunda (otra tarea) pintara cada subagente como hijo del tab en la WorkspaceBar. Por eso el store guarda un registro por subagente y no un contador.

## Lo que se midio

Captura real con `claude -p` y un hook que apunta cada evento (13-oct-2026, un subagente en segundo plano que ejecuta `sleep 20`):

| Hora | Evento | Detalle |
|---|---|---|
| :18 | SessionStart | |
| :19 | UserPromptSubmit | |
| :22 | SubagentStart | `agent_id`, `agent_type: general-purpose` |
| :24 | Stop | `background_tasks` con 1 subagente |
| :48 | SubagentStop | mismo `agent_id` |
| :48 | UserPromptSubmit | turno nuevo, lo abre la notificacion de fin del subagente |
| :50 | Stop | `background_tasks` vacio |
| :50 | SessionEnd | |

Consecuencias:

- `SubagentStart` llega antes que el `Stop` del turno principal, y ese `Stop` ya trae el subagente en `background_tasks`.
- Cada entrada de `background_tasks` tiene `id` (igual que `agent_id`), `type` (`subagent`), `status`, `description` y `agent_type`. La `description` sirve para la segunda entrega.
- Cuando el ultimo subagente acaba, Claude abre solo un turno nuevo (`UserPromptSubmit` y luego `Stop`). Ese `Stop` final, con la lista vacia, es el que debe producir el aviso amarillo.

Limite de la medida: una sola captura, en modo `-p`, con un subagente. Se repite en la app real al final.

## Diseno

### Hooks y script

- `SESSION_HOOK_EVENTS` pasa de 8 a 10 eventos: se anaden `SubagentStart` y `SubagentStop`. Hay que cambiar el tamano del array (`[&str; 8]`) y el comentario "All 8 events"; los tests existentes recorren el array y no necesitan tocarse.
- `trigger-event.sh` los reenvia por el socket igual que el resto, y sube a `kex-session-v6`. Quien tenga el v5 instalado vera otra vez el boton "Set up Claude Code".

### Rust (`pty/ipc.rs`)

- `Payload` lee `agent_id`, `agent_type` y `background_tasks`.
- Las senales `SubagentStart` y `SubagentStop` llevan `agentId`, `agentType` y, en el inicio, la `description` si existe.
- La senal `Stop` lleva `backgroundSubagents`: las entradas de `background_tasks` con `type == "subagent"` y `status == "running"`, cada una con `id`, `agentType` y `description`.

### Store (`agentStore.ts`)

- `AgentSession.subagents: Record<agentId, { agentType, description?, startedAt }>`, vacio por defecto.
- Acciones: `subagentStarted`, `subagentStopped` y `reconcileSubagents(tabId, lista)`, que sustituye el conjunto entero.
- `finish()` borra la sesion y con ella el conjunto, asi que al terminar la sesion no queda nada.
- El campo es obligatorio. `AgentSession` se construye en 4 sitios de `agentStore.ts` (`start`, `startIdle`, `startRestored`, `setRestoreError`), que pasan a poner `subagents: {}`, y en los fixtures de 4 ficheros de test (`sessionEndPolicy`, `agentSnapshot`, `notificationVisibility`, `notificationList`).
- Una sesion restaurada arranca con el conjunto vacio: los subagentes no sobreviven a cerrar Kex.

### Regla de estado (funcion pura nueva, con tests)

`stopOutcome({ activeSubagents, tabSeen })` devuelve `working`, `attention` o `idle`:

- Con subagentes activos devuelve `working` y no se notifica nada.
- Sin ellos devuelve `attention` si el tab no esta a la vista, y `idle` si lo esta (lo que hace hoy `Stop`).

### Puente de senales (`AgentNotificationsBridge.tsx`)

- `Stop`: primero `reconcileSubagents` con `backgroundSubagents`, que manda sobre lo guardado. Despues aplica `stopOutcome`.
- `SubagentStart`: asegura la sesion y anade el registro. No cambia el estado.
- `SubagentStop`: quita el registro. No cambia el estado, porque el turno nuevo que abre Claude se encarga (`UserPromptSubmit` pone `working`, su `Stop` aplica la regla).

### Que se ve

`buildAgentEntries` ya devuelve `working` para una sesion en ese estado, asi que la WorkspaceBar pinta el spinner existente. No se toca la UI.

## Cambio respecto a lo acordado

El criterio 2 de TASK-822 decia que al terminar el ultimo subagente se aplicaba lo que habria hecho el `Stop`. La captura muestra que no hace falta: el turno nuevo de Claude ya trae su propio `Stop`. Aplicarlo ademas en `SubagentStop` provocaria un amarillo falso un instante antes del `UserPromptSubmit`. Por eso `SubagentStop` solo quita el registro.

## Riesgos

- Si en algun caso no llega el turno nuevo tras el ultimo `SubagentStop`, la sesion se quedaria en `working` hasta el siguiente `Stop` o el fin de sesion. No se ha visto, y un temporizador de seguridad no se anade sin evidencia de que haga falta.
- Un `SubagentStart` perdido (Kex arranca con la sesion a medias) se corrige en el siguiente `Stop` gracias a `background_tasks`.
- Los subagentes en primer plano tambien emiten `SubagentStart` y `SubagentStop`, pero ocurren dentro de un turno, con la sesion ya en `working`, y no cambian nada.

## Pruebas

- `stopOutcome`: subagentes activos o no, tab a la vista o no.
- Store: anadir, quitar, reconciliar y vaciar al terminar la sesion.
- Puente: orden `SubagentStart`, `Stop` (sigue `working`, sin notificar), `SubagentStop`, `UserPromptSubmit`, `Stop` (ahora si `attention`).
- Rust: parseo de `SubagentStart`, `SubagentStop` y del `Stop` con `background_tasks`; ajustar los tests que cuentan los 8 eventos y la version del script.

## Documentacion a actualizar

`docs/IPC.md` (senales nuevas y campos de `Stop`), `docs/ARCHITECTURE.md` (modelo de sesion de agente), `AGENTS.md` (marcador `kex-session-v5` pasa a v6) y `docs/AGENT_SESSION_RESTORE.md` (marcador y "all 8 registered" pasan a v6 y 10).
