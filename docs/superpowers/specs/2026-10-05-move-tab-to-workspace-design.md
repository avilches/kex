# Mover tabs entre workspaces

Tarea de Backlog: TASK-8.

## Objetivo

Hoy una tab solo se puede mover dentro de su workspace: `moveTab`, `splitPaneAndPlace` y todo el
drag-and-drop de tabs trabajan sobre un único workspace, y `docs/WORKSPACES.md` documenta que los
drops entre workspaces están bloqueados. Se quiere poder llevar una tab a otro workspace de dos
maneras, y que un terminal siga vivo (mismo PTY, mismo historial) al moverse.

Fuera de alcance: arrastrar un fichero del explorer a otro workspace, soltar la tab directamente
sobre el icono de un workspace sin esperar el cambio, y un ajuste en Settings para el retardo.

## Comportamiento

### Arrastrar

1. Mientras se arrastra una tab, cada icono de workspace de la WorkspaceBar es un destino. Si el
   puntero permanece 600 ms sobre un icono, ese workspace pasa a ser el activo. El temporizador se
   cancela al salir del icono, al soltar o al cancelar.
2. Con el workspace destino visible, se suelta con las zonas de siempre: hueco entre tabs, centro de
   un pane y las cuatro divisiones. La tab conserva su id.
3. Si el arrastre se cancela (Esc) o se suelta donde no hay acción, se vuelve a mostrar el workspace
   desde el que empezó el arrastre. Solo se queda en el destino si la tab se colocó de verdad.

### Menú contextual de la tab: "Move to Workspace"

Submenú con "New" primero y, si hay más workspaces, un separador y todos los demás con una bolita de
su color y su nombre. El workspace actual no aparece. Tras elegir, el usuario se queda en el
workspace actual.

Reglas de colocación al elegir un workspace existente:

- Destino con un solo pane con tabs: se divide en dos (horizontal) y la tab queda en la mitad nueva,
  a la derecha.
- Destino ya dividido: la tab va a su pane activo.
- Destino con un solo pane vacío: la tab va ahí, sin dividir.

"New" crea un workspace con la tab como única tab, usando el cwd de la tab si lo tiene.

Si el workspace origen se queda sin tabs no se cierra: queda un pane vacío con su pantalla de
bienvenida.

## Diseño

### Operación atómica

Una única acción de `useWorkspaces`, `moveTabToWorkspace(tabId, sourceWorkspaceId, target)`, que
actualiza origen y destino en un solo `setWorkspaces`. Mover en dos pasos (quitar y luego abrir)
parpadearía y un fallo intermedio perdería la tab; clonarla con un id nuevo mataría el PTY.

`target` es una unión:

- `{ workspaceId, paneId, index? }`: pane concreto, con posición opcional.
- `{ workspaceId, paneId, direction }`: dividir un pane (`left`, `right`, `top`, `bottom`).
- `{ workspaceId }`: colocación automática del menú.
- `{ newWorkspace: true }`.

### Función pura

En `splitNode.ts` (núcleo funcional, sin React): recibe el árbol origen, el árbol destino y la tab, y
devuelve los dos árboles nuevos, reutilizando el colapso de panes vacíos de `moveTabBetweenPanes` y
`splitPaneAndInsertTab`. El `activeTabId` del pane origen se recalcula como en un cierre normal.

### Arrastre

- Cada icono de `WorkspaceBar` se registra con `useDroppable` con un id propio
  (`ws-switch:<workspaceId>`). Un hook pequeño con la lógica del temporizador, separada en una
  función pura testeable, llama a `selectWorkspace` tras 600 ms de `isOver` con una tab arrastrándose.
- `WorkspaceDndProvider` recuerda el workspace activo al empezar el arrastre y lo restaura en
  `onDragCancel` y cuando `onDragEnd` no produce ninguna colocación.
- `handleDragEnd` resuelve el pane destino buscando en todos los workspaces. Si pertenece a otro
  workspace llama a `moveTabToWorkspace`; si no, a las acciones actuales. Se sustituye la regla
  "los drops entre workspaces están bloqueados".
- `WorkspaceView` mantiene montados todos los workspaces y oculta los inactivos con
  `opacity-0 invisible`, así que la `DraggableTab` de la tab arrastrada no se desmonta al cambiar de
  workspace durante el arrastre.

### Menú

Entrada nueva en el `ContextMenu` de `PaneTabBar`. La lista de workspaces (id, nombre, color) llega
por props desde `App.tsx` a través de `PaneView`. La bolita usa los helpers de color de
`workspaceColor.ts`. No hay atajo de teclado, así que no toca el registry `SHORTCUTS`.

### Estado ligado al workspace

- `agentStore`: cada sesión guarda un `workspaceId`; hay que actualizarlo al mover, o las
  notificaciones apuntarían al workspace equivocado.
- A verificar al planificar: `Script.tabId` de los workspaces, el store de sesiones de agente en
  Rust (`agent-sessions.json`, restore), y que el pool de terminales se indexa solo por tab id.
- A verificar al planificar: las zonas de drop y los huecos `tab-insert:` del workspace oculto no
  deben seguir activos (los workspaces están apilados con `absolute inset-0`).

## Pruebas

- Unitarias de la función pura: un pane con tabs que se divide, árbol ya dividido que usa el pane
  activo, pane vacío sin dividir, colapso del origen, `activeTabId`, id de tab conservado, workspace
  nuevo.
- Unitarias del temporizador de hover y de la acción de `useWorkspaces`.
- Manual con `pnpm tauri dev` desde el worktree: mover un terminal con un proceso vivo y comprobar
  que sigue corriendo y conserva su historial; cancelar un arrastre con Esc y soltar en un sitio sin
  acción.

## Documentación

`docs/WORKSPACES.md`: reescribir la sección de drag-and-drop (el párrafo de drops entre workspaces
bloqueados, la resolución de drops de tabs) y añadir las acciones nuevas. Entrada en
`docs/WORKSPACES_GOTCHAS.md` solo si algo no obvio sale al implementar.
