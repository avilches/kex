# Terminal Autofocus + terminal que dirige el sidebar

Fecha: 2026-06-22

## Problema

Hoy el File Explorer ofrece cuatro modos de root (`ROOT_MODES` en `FileExplorer.tsx`):
`filesystem`, `pinned`, `terminal` ("Follow Terminal") y `git` ("Follow Git Root"). Los dos
ultimos hacen que la raiz del explorer siga en vivo el cwd del terminal activo. Ademas, el panel
de Source Control / Git History deriva su repo del cwd del terminal activo mediante un effect en
`App.tsx` que llama a `gitResolveRepo(terminalRootCwd)` cada vez que ese cwd cambia.

Este "seguimiento pasivo del terminal activo" es implicito y poco controlable: cualquier terminal
que reciba foco arrastra las vistas laterales. Queremos sustituirlo por un control explicito y
por-terminal.

## Objetivo

1. Eliminar los modos "Follow Terminal" y "Follow Git Root" del explorer y sus shortcuts.
2. Anadir un flag persistido `autofocus` por panel terminal.
3. Establecer un unico modelo: **el terminal que dirige el sidebar**. Las dos vistas laterales
   (Explorer y Source Control / Git History) se actualizan juntas solo cuando:
   - el usuario pulsa **F4** sobre un terminal (o fichero), o
   - un terminal con `autofocus` activo **gana el foco** o **cambia su cwd estando enfocado**.
4. Un terminal sin autofocus, al recibir foco, **no** mueve las vistas laterales.

## Semantica del Autofocus

Autofocus equivale a "pulsar F4 automaticamente, pero solo mientras el tab tiene el foco". Se
re-dispara en dos momentos:

- el tab con autofocus **gana el foco** (pasa a ser el panel activo del workspace activo), o
- el tab con autofocus **ya enfocado cambia su cwd** (OSC 7 / `onCwd`).

Un tab con autofocus en segundo plano que cambia su cwd no hace nada hasta recibir el foco. Varios
tabs pueden tener autofocus a la vez; solo actua el que esta enfocado. Los paneles de fichero /
editor no tienen flag autofocus.

## La accion unificada: regla cascada de resolucion

Tanto F4 como el autofocus invocan la misma resolucion a partir de una carpeta (la cwd del
terminal, o el dirname del fichero en el caso de F4 sobre un editor). Se calculan **las dos vistas
a la vez**:

### Explorer root (regla cascada)

1. Si la carpeta cuelga del **workspace root** (modo `pinned`) -> modo `pinned`, root = workspace
   root.
2. Si no, y la carpeta esta dentro de un **repo git** -> modo `filesystem`, root = git root.
3. Si no -> modo `filesystem`, root = ancestro comun con el root actual / dirname de la carpeta.

En los tres casos se dispara un `revealRequest` que expande las ramas intermedias y selecciona la
carpeta (o el fichero, en F4 sobre editor).

### Git root (Source Control + Git History)

`gitResolveRepo(carpeta)` -> `currentGitRoot` (+ `gitRootByWs`). Si el resultado es `null` (la
carpeta no esta en ningun repo), el panel de git changes queda **vacio** (estado "sin repo").

Las dos resoluciones se calculan desde la **misma carpeta** en el mismo momento, de modo que
Explorer y git changes quedan coherentes con el terminal que disparo la accion.

## Diferencia entre F4 y Autofocus

Ambos comparten la resolucion anterior. Difieren solo en el efecto sobre el panel derecho:

### F4 (`tab.focusOnExplorer`)

- Si el panel derecho esta **cerrado**, lo **abre**.
- Pestaña activa (`rightPanelActiveTab`):
  - `explorer` -> se queda en `explorer` (solo actualiza root).
  - `git` (Source Control) -> se queda en `git` (solo actualiza root).
  - `history` (Git History) -> conmuta a `explorer`.
- Aplica tanto a paneles terminal (carpeta = cwd) como a paneles de fichero (carpeta = dirname,
  selecciona el fichero).

### Autofocus

- **No** abre el panel derecho.
- **No** conmuta la pestaña activa.
- Solo actualiza el estado de ambos roots (explorer root mode/fsRoot + git root). Si estas en
  `git` o `history`, sigues en esa pestaña pero su root se actualiza; el explorer queda en su sitio
  para cuando vuelvas a el. El `revealRequest` se aplica cuando el explorer este visible.

## Estado y persistencia

### Nuevo campo de panel

En `src/modules/workspaces/lib/types.ts`, el panel terminal gana `autofocus?: boolean`
(ausente/false por defecto). Se persiste en `workspace-state.json` mediante la serializacion
existente (`sanitizePanel`). Solo aplica a `kind: "terminal"`.

### Eliminaciones

- `ExplorerRootMode` se reduce a `"filesystem" | "pinned"` (`workspaces/lib/explorerRoot.ts`).
  Desaparecen las ramas `terminal` y `git` de `resolveExplorerRoot`.
- `ROOT_MODES` en `FileExplorer.tsx` queda con `filesystem` ("File System") y `pinned`
  ("Workspace Root").
- Shortcuts `explorer.viewTerminal` (Ctrl+3) y `explorer.viewGit` (Ctrl+4) y sus entradas en
  `SHORTCUTS` (`shortcuts.ts`).
- Sus handlers en `App.tsx` (`showExplorerWithMode("terminal" | "git")`).
- El effect de `App.tsx` que recalcula `currentGitRoot` a partir del cwd del terminal activo. El
  git root pasa a fijarse exclusivamente dentro de la accion unificada (F4 / autofocus).

### Migracion de estado persistido

Workspaces que tengan persistido `explorerRootMode === "terminal"` o `"git"` deben migrarse a un
modo valido al cargar (p. ej. a `filesystem` con el fsRoot existente, o `pinned`). Sin migracion,
un valor obsoleto romperia `resolveExplorerRoot`.

## Estado inicial

- Al arrancar / restaurar un workspace se restaura el **explorer root persistido** (mode + fsRoot)
  y su git root derivado. El flag `autofocus` de cada tab tambien se restaura.
- El autofocus **no se auto-ejecuta** por el mero arranque: no se simula un "gano el foco". Empieza
  a actuar con la primera interaccion real (cambias a un tab con autofocus, o ese tab enfocado
  cambia de cwd). Asi no pisa el explorer root persistido.
- Workspace nuevo sin historial: explorer root = **home** del usuario; git root resuelto desde home
  (vacio si home no es repo).
- El modelo deja la puerta abierta a un **root inicial por workspace** (para un futuro "New
  Workspace from folder": el workspace se crea apuntando a una ruta y esa es su raiz inicial). La
  entrada de menu en si queda fuera del alcance de este cambio.

## UI

### Toggle en el hover popup

En `TerminalHoverCardContent` (`PaneTabBar.tsx`), un toggle **"Autofocus"** en la parte superior
del popup que setea `panel.autofocus` via `onUpdatePanel`. Sigue el patron de checkbox existente
("Lock tab", "Run on start").

### Mirilla en el tab

En el tab del terminal, un icono **mirilla** (target / crosshair de hugeicons) sutil cuando
`autofocus` esta activo, para ver de un vistazo que tabs lo tienen sin abrir el hover.

## Disparadores (wiring)

- **Ganar foco**: cuando un panel terminal pasa a ser el panel activo del workspace activo y tiene
  `autofocus`, invocar la accion unificada con `panel.cwd`. Punto de enganche: el cambio de
  `activePaneId` / `activePanelId` en el estado de workspaces.
- **Cambio de cwd**: en el callback `onCwd` (App.tsx), si el panel que emite es el panel activo y
  tiene `autofocus`, invocar la accion unificada con el nuevo cwd. (El statusbar / breadcrumb sigue
  reflejando la cwd del terminal activo como hoy; eso no cambia.)

## Arquitectura

- La regla cascada vive en una **funcion pura** (en `workspaces/lib/explorerRoot.ts` o adyacente):
  entradas (carpeta, workspace root, git root, root actual, home) -> salida (mode + fsRoot). Sin
  dependencias de React ni IPC. La resolucion del git root (`gitResolveRepo`) es asincrona y se
  hace en el shell imperativo (App.tsx), pasando el resultado a la funcion pura.
- F4 y autofocus son envoltorios delgados sobre `focusSidebarOnFolder(cwd, { openPanel, switchTab })`
  o equivalente, que orquesta: resolver explorer target -> set mode/fsRoot -> resolver git root ->
  set currentGitRoot -> emitir revealRequest, mas (solo F4) abrir panel / conmutar pestaña segun la
  regla de la seccion F4.

## Tests

- Funcion pura de la regla cascada: casos workspace-under (modo pinned), git-under (filesystem con
  git root), fallback (filesystem con ancestro/dirname), y carpeta == workspace root.
- Migracion de `explorerRootMode` obsoleto (`terminal` / `git`) a modo valido.
- Disparo de autofocus: actua con (foco + cambio de cwd) y con (ganar foco); no actua si el tab no
  esta enfocado aunque cambie su cwd; no actua para un tab sin autofocus al ganar foco.
- F4: abre el panel si esta cerrado; respeta pestaña `explorer` y `git`; conmuta a `explorer` desde
  `history`.

## Fuera de alcance

- La entrada de menu "New Workspace from folder" (solo se deja preparado el soporte de root inicial
  por workspace).
- Cualquier cambio en el statusbar / breadcrumb de cwd.
