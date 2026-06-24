# Aviso de procesos al cerrar un workspace

## Objetivo

Al cerrar un workspace (boton X del sidebar, o Cmd+W sobre un workspace vacio), si
hay terminales con procesos en foreground y el aviso de procesos esta activo,
mostrar un unico modal que avise "There are N terminals with running processes" y
liste los procesos, antes de matarlos. Si ese aviso no aplica, se mantiene el flujo
actual de confirmacion de cierre de workspace.

## Punto de partida

`requestCloseWorkspace(wsId)` (en `App.tsx`, mergeado en la feature anterior) es el
unico embudo de cierre de workspace, compartido por la X del sidebar y por Cmd+W:

```
requestCloseWorkspace(wsId):
  si warnOnCloseWorkspace -> abrir modal de confirmacion de workspace
  si no -> handleCloseWorkspace(wsId)  (cierra directo)
```

`closeWorkspace` elimina el workspace entero con un `filter` directo: NO pasa por los
guards de cierre por-tab (`useTabCloseGuards`), asi que hoy matar procesos al cerrar
un workspace no avisa de nada.

Utilidades existentes reutilizables:
- `leafHasForegroundProcess(panelId): Promise<string | null>` (`@/modules/terminal`):
  mismo criterio que el guard de cierre de un tab individual. Es **asincrona** (IPC
  `pty_has_foreground_process`); devuelve el nombre del proceso en foreground o `null`.
- `getRunningCommandsSnapshot()` (`terminalEphemeralStore`): `ReadonlyMap<panelId, command>`
  sincrono, con el comando en curso por terminal.
- `allPanes(paneTree)` (`splitNode`): lista de panes del workspace.
- Preferencia `warnOnCloseTabWithRunningProcess` con su setter
  `setWarnOnCloseTabWithRunningProcess`.

## Variables

- **A** = `warnOnCloseTabWithRunningProcess` (on/off)
- **B** = `warnOnCloseWorkspace` (on/off)
- **P** = el workspace tiene al menos un terminal con proceso en foreground

## Matriz de comportamiento (acordada)

| # | A | B | P | Resultado |
|---|---|---|---|-----------|
| 1 | on | on | si | Modal de procesos |
| 2 | on | off | si | Modal de procesos |
| 3 | on | on | no | Modal de confirmacion de workspace (B) |
| 4 | on | off | no | Cierra directo |
| 5 | off | on | si | Modal de workspace (B), sin listar procesos |
| 6 | off | off | si | Cierra directo y mata procesos sin avisar |
| 7 | off | on | no | Modal de workspace (B) |
| 8 | off | off | no | Cierra directo |

Decisiones cerradas:
- Confirmar el modal de procesos cierra el workspace directamente; NO encadena el
  modal de confirmacion de workspace aunque B este on.
- El modal de procesos lleva checkbox "Don't ask me again" que apaga **A**
  (`warnOnCloseTabWithRunningProcess`), igual que el modal de cierre de un terminal
  individual.
- Caso 6 (A off, B off, con procesos): cierra en silencio. Coherente con que el
  usuario desactivo ambos avisos.

## Diseno

### Cascada en `requestCloseWorkspace(wsId)` (ahora async)

`requestCloseWorkspace` pasa a ser `async` (la deteccion de procesos es asincrona). Los
dos call sites (X del sidebar, Cmd+W) la invocan como fire-and-forget (`void`), no usan
el retorno.

```
prefs = usePreferencesStore.getState()
ws    = workspacesRef.current.find(w => w.id === wsId)
1. si prefs.warnOnCloseTabWithRunningProcess y ws:
     running = await collectRunningTerminals(
       ws,
       leafHasForegroundProcess,
       id => getRunningCommandsSnapshot().get(id),
     )
     si running.length > 0:
        setPendingWorkspaceProcesses({ id: wsId, processes: running })
        return
2. si prefs.warnOnCloseWorkspace:
     setPendingCloseWorkspace({ id: wsId, isLast: workspacesRef.current.length === 1 })
     return
3. handleCloseWorkspaceRef.current(wsId)   // cierra directo
```

Cmd+W solo cierra workspaces vacios (sin tabs -> sin procesos), asi que la rama 1
solo se activa de hecho via la X del sidebar. Ambos comparten este embudo.

### Functional core: `collectRunningTerminals` (puro, testeable, async)

Nueva funcion pura exportada (junto a los `apply*` en `useWorkspaces.ts`):

```
collectRunningTerminals(
  ws: Workspace,
  getForegroundProcess: (panelId: string) => Promise<string | null>,
  getCommand: (panelId: string) => string | undefined,
): Promise<{ panelId: string; label: string }[]>
```

Recorre `allPanes(ws.paneTree)`, filtra `panel.kind === "terminal"`, consulta cada uno
con `getForegroundProcess` en paralelo (`Promise.all`), incluye los que devuelven un
nombre no nulo, con `label = getCommand(panel.id) ?? processName ?? panel.title ?? "shell"`.
Preserva el orden de los panes. Inyectar `getForegroundProcess`/`getCommand` permite
testear sin estado mutable ni IPC; en App se llama con `leafHasForegroundProcess` y el
getter del snapshot. Coste: N llamadas IPC en paralelo, solo cuando A esta on y se cierra
un workspace.

### Modal de procesos (en `CloseDialogs.tsx`)

Un nuevo `AlertDialog`, mismo estilo que los existentes:
- Prop nueva: `pendingWorkspaceProcesses: { id: string; processes: { panelId: string; label: string }[] } | null` + `onCancelWorkspaceProcesses` + `onConfirmWorkspaceProcesses(dontAskAgain: boolean)`.
- Reset del checkbox al abrir (efecto sibling de los existentes).
- Titulo: "Close this workspace?"
- Descripcion singular/plural:
  - >1: "There are N terminals with running processes. Closing the workspace will end them."
  - ==1: "There is 1 terminal with a running process. Closing the workspace will end it."
- Lista de los `label` (mismo estilo que la linea `Command:` del modal de terminal).
- Checkbox "Don't ask me again".
- Cancel / Close. Al confirmar: si el checkbox esta marcado, `setWarnOnCloseTabWithRunningProcess(false)`; luego `handleCloseWorkspace(id)`.

### Cableado en `App.tsx`

- Estado `pendingWorkspaceProcesses` analogo a `pendingCloseWorkspace`.
- `requestCloseWorkspace` implementa la cascada de 3 ramas anterior.
- En el render de `<CloseDialogs>`: pasar las tres props nuevas. `onConfirmWorkspaceProcesses` captura el id antes de limpiar el estado, aplica el dontAskAgain y llama `handleCloseWorkspaceRef.current(id)`.

## Modulos / ficheros afectados

- `src/app/App.tsx` (cascada en requestCloseWorkspace, estado pendingWorkspaceProcesses, render de CloseDialogs).
- `src/app/components/CloseDialogs.tsx` (nuevo AlertDialog de procesos).
- `src/modules/workspaces/lib/useWorkspaces.ts` (collectRunningTerminals puro).
- `src/modules/workspaces/lib/useWorkspaces.test.ts` (tests de collectRunningTerminals).

## Tests

- `collectRunningTerminals`:
  - workspace con varios panes/terminales, mezcla de running/no-running -> solo los running.
  - label = comando si existe; si no, titulo del tab; si no, "shell".
  - panel no-terminal con id en el snapshot -> ignorado.
  - workspace sin terminales o sin procesos -> lista vacia.
- La cascada de `requestCloseWorkspace` y el modal se validan manualmente con `pnpm tauri dev`.

## Documentacion

- `docs/ARCHITECTURE.md`: la cascada de dos avisos al cerrar workspace (procesos -> workspace -> directo).
- `docs/FORK.md`: ampliar la entrada de "workspaces sin tabs" con el aviso de procesos al cerrar, si procede.
