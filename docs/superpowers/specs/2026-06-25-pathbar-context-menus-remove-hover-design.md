# Path bar context menus + remove tab HoverCard

Fecha: 2026-06-25
Rama: `remove-hover-popup`

## Objetivo

Unificar la barra de path del terminal con la del editor (mismo breadcrumb de
badges), reemplazar el HoverCard flotante de las pestanas por menus contextuales
en los segmentos de path y un menu `[...]` a la derecha del terminal, y permitir
operar sobre ficheros y directorios directamente desde la barra de path.

## Decisiones validadas (brainstorming de esta sesion)

1. **Terminal path bar = estilo editor**: breadcrumb de badges, no texto plano.
2. **Lado derecho del terminal**: indicadores inline (run-on-start + agente) que
   se ven siempre, mas un boton `[...]` con el detalle y las acciones.
3. **HoverCard de las pestanas**: se elimina del todo (terminal y editor). La
   pestana conserva solo su tooltip nativo de titulo.
4. **Menu contextual por segmento de directorio** (terminal y editor): las 4
   primeras acciones del menu de directorio del explorer + copy paths + gitignore.
   Confirmado que el terminal tambien incluye "Set as Workspace Root" y "New
   Workspace from Folder".
5. **Menu contextual del fichero del editor**: Reveal in Finder, Rename,
   Duplicate, Copy Absolute/Relative Path, Add to .gitignore, Delete.
6. **Transcript del agente**: la unica accion es **Reveal in Finder** (no copy,
   no open in editor). El session id conserva su accion de copy actual.

## Estado de partida (verificado en codigo)

- `EditorPathBar.tsx` ya usa un breadcrumb rico: `EditorPathBreadcrumb.tsx` +
  `buildEditorPathBreadcrumb`, con badges `variant="outline"`, iconos Home/Pin,
  colores por relacion (`above-root` / `root` / `inside-root`) y separadores
  chevron. El ultimo segmento (fichero) es un `BreadcrumbPage` no clicable.
- `TerminalPathBar.tsx` muestra el cwd en texto plano truncado (rtl) via
  `segmentsFromCwd`, y a la derecha `pid . proceso . CPU . RAM` leidos de
  `terminalMetricsStore` + `terminalEphemeralStore`. No tiene `[...]`.
  (El spec previo `2026-06-25-terminal-info-bar-design.md` declaraba "sin
  dropdown" por YAGNI; esto lo revierte ahora que hay contenido meta que alojar.)
- El **HoverCard** vive en `PaneTabBar.tsx` (openDelay 700ms) y renderiza
  `TerminalHoverCardContent` (path, repo root, running, run-on-start checkbox +
  input de `persistentCommand`) o `AgentHoverCardContent` (path, repo root,
  session id, transcript, started, run-on-start, errores de restore) usando el
  helper `HoverRow`.
- Menu contextual del explorer: definido inline en `TreeRow.tsx` con `ContextMenu`
  de shadcn. Handlers en `useFileTree.ts` (`beginRename`, `beginDuplicate`,
  `requestDelete`/`trashPath`/`deletePath`, `copyEntry`...). Helpers puros en
  `lib/contextActions.ts` (`copyToClipboard`, `relativePath`, `revealInFinder`,
  `REVEAL_LABEL`) y `lib/gitignore.ts` (`gitignoreEntryFor`).
- Canal reveal: `RevealRequest = { path: string; nonce: number }` en
  `FileExplorer.tsx`. App.tsx lo genera en `focusSidebar` incrementando `nonce`;
  `FileExplorer` lo consume en un `useEffect` que llama `applyRevealTarget`
  (expande ancestros, selecciona, hace scroll). El path bar lo dispara via
  `callbacks.onFocusOnExplorer(path)`.
- Modelo Panel terminal (`workspaces/lib/types.ts`): `restoreOnRestart?: boolean`,
  `persistentCommand?: string`. Meta del agente (`agents/store/agentStore.ts`):
  `AgentSessionMeta = { sessionId?, cwdLaunch?, sessionTitle?, model?, transcriptPath? }`,
  estado en `AgentSession.status`.

## Arquitectura

### A. Breadcrumb compartido `PathBreadcrumb`

Extraer el breadcrumb del editor a un componente reutilizable (modulo compartido,
p. ej. `src/modules/workspaces/pathbar/PathBreadcrumb.tsx`, o `src/components/`
si se prefiere fuera de un modulo de feature). Caracteristicas:

- Recibe los segmentos ya calculados (`{ label, fullPath, isHome, relation }[]`)
  mas un render del **trailing**: el editor pasa el nombre de fichero como
  `BreadcrumbPage` no clicable; el terminal no pasa trailing (el ultimo segmento
  es el cwd actual, un directorio clicable mas, marcado `root` si coincide con el
  workspace root).
- Mantiene badges, iconos Home/Pin, `RELATION_CLASS`, separadores chevron.
- Por segmento expone dos gestos: **click izquierdo** = `onRevealPath(fullPath)`
  (igual que hoy), **click derecho** = abre el menu contextual del segmento (ver C).
- `EditorPathBreadcrumb` pasa a ser un wrapper delgado sobre `PathBreadcrumb`
  (o se elimina, reusando `PathBreadcrumb` directamente desde `EditorPathBar`).
- La logica de calculo de segmentos: el editor sigue usando
  `buildEditorPathBreadcrumb`; para el terminal se anade un helper hermano que
  produce los mismos segmentos a partir del cwd (todos directorios, sin trailing
  de fichero). Ambos helpers viven juntos y son unit-testables.

### B. Terminal path bar: indicadores + `[...]`

`TerminalPathBar.tsx` reescribe ambos lados:

- **Izquierda**: `PathBreadcrumb` con los segmentos del cwd (sustituye el texto
  plano `segmentsFromCwd`).
- **Derecha** (`ml-auto`, de izquierda a derecha):
  1. Metricas `proceso . CPU . RAM` (y PID): sin cambios de logica, leidas de los
     stores como hoy.
  2. **Indicador run-on-start**: icono discreto (`text-muted-foreground`,
     hugeicons, p. ej. una flecha de recarga) visible solo si
     `restoreOnRestart !== false` y `persistentCommand` no vacio. `title` nativo =
     el comando. Click abre el `[...]`.
  3. **Chip de agente**: visible solo si hay `agentSession` para el panel. Punto
     de color segun `status` (misma semantica que NotificationBell: working ambar,
     attention rojo/naranja, finished/idle verde/gris) + texto del modelo
     (`meta.model`) o nombre del agente. Sin interaccion propia (el detalle esta
     en `[...]`).
  4. **Boton `[...]`**: estilo identico al view-options del editor
     (`size-[22px] ... text-muted-foreground hover:text-foreground`, icono
     `MoreHorizontalIcon` 12px). Abre un `DropdownMenu` con:
     - **Run on start**: checkbox (toggle `restoreOnRestart`) + input del comando
       persistente (`persistentCommand`). Reusa la logica que hoy vive en
       `TerminalHoverCardContent`.
     - Si hay agente: **Session** (mono + copy), **Transcript** (mono + accion
       **Reveal in Finder**; si `transcriptExists === false`, sufijo "not created
       yet"), **Started** (elapsed), y mensaje de error de restore si lo hay.
- Props nuevas que `TerminalPathBar` necesita: el panel (para `restoreOnRestart`
  / `persistentCommand` y el `onUpdatePanel`), el `agentSession` (lookup por
  `panelId` en el store), `workspaceRoot` y `home` para el breadcrumb, y los
  callbacks de menu contextual de segmento (ver D). `PanelContent` ya tiene a
  mano el panel y los callbacks; se le pasan.

El `[...]` se renderiza siempre (al menos contiene run-on-start). Esto es el
unico ajuste meta del terminal, asi que no contradice el YAGNI de "ajustes por
extension" (que el terminal no tiene).

### C. Menu contextual por segmento de directorio

Componente compartido `DirSegmentContextMenu` (envuelve cada badge de directorio
del breadcrumb, en editor y terminal). Items, en orden:

1. Set as Workspace Root (icono PinIcon) -> `onSetAsRoot(path)`
2. New Workspace from Folder (DashboardSquareAddIcon) -> `onNewWorkspaceFromFolder(path)`
3. Open in Terminal (ComputerTerminal01Icon) -> `onRevealInTerminal(path)`
4. Reveal in Finder (FolderOpenIcon, `REVEAL_LABEL`) -> `revealInFinder(path)`
5. separador
6. Copy Relative Path (Link01Icon) -> `copyToClipboard(relativePath(root, path))`
7. Copy Absolute Path (CopySlashIcon) -> `copyToClipboard(path)`
8. separador (condicional) + Add to .gitignore (ViewOffSlashIcon) ->
   `onAddToGitignore(path, true)`, visible solo si `gitignoreEntryFor(gitRoot, path, true)`.

Todas estas acciones son "puras" o de navegacion: usan helpers de
`contextActions.ts`/`gitignore.ts` y callbacks ya cableados en App.tsx
(`onSetAsRoot`, `onNewWorkspaceFromFolder`, `onRevealInTerminal`,
`onAddToGitignore`). No requieren el arbol del explorer. Add-to-gitignore se
enruta al handler existente de App.tsx (que ya hace append + refresh), no al
canal de reveal.

### D. Menu contextual del fichero del editor

Componente `FileLeafContextMenu` que envuelve el trailing (nombre de fichero) del
`EditorPathBar`. Items, en orden:

1. Reveal in Finder -> `revealInFinder(path)` (directo)
2. Rename -> reveal + accion `rename`
3. Duplicate -> reveal + accion `duplicate`
4. separador
5. Copy Absolute Path -> directo
6. Copy Relative Path -> directo
7. separador (condicional) + Add to .gitignore -> `onAddToGitignore(path, false)` (directo)
8. separador + Delete (destructive) -> reveal + accion `delete`

Las acciones que mutan el arbol (Rename, Duplicate, Delete) **se delegan al
explorer** para reutilizar su UI (inline rename, inline duplicate,
`DeleteEntryModal`) y mantener el arbol consistente, en vez de duplicar logica.

### E. Canal "reveal + pendingAction"

Extender el canal de reveal existente (cambio minimo, patron ya identificado):

- `RevealRequest = { path: string; nonce: number; pendingAction?: "rename" | "duplicate" | "delete" }`.
- App.tsx: `focusSidebar` (y `onFocusOnExplorer`) acepta un `pendingAction`
  opcional y lo propaga al `setRevealRequest`. Antes de revelar abre el panel
  derecho en la pestana explorer (ya lo hace para `fromShortcut`); para una accion
  con `pendingAction` debe forzar `rightPanelOpen` + tab `explorer` igual.
- `FileExplorer.applyRevealTarget`: tras `setSelectedPath(file)`, si hay
  `pendingAction` y el path esta en `entryIndexByPath`, dispara el handler local
  correspondiente: `rowActions.beginRename(file)`,
  `rowActions.beginDuplicate(file, kind)`, o `setPendingDelete({ path, isDir })`.
  El `pendingAction` se consume junto con el `nonce` (no se repite en re-render).
- Caso "pending" (ancestros aun cargando): el `useEffect` ya reintenta; la accion
  se aplica cuando el reveal pasa a "done". Si el fichero no aparece en el arbol
  (oculto / fuera de root), no se aplica accion (se revela lo que se pueda y se
  ignora la accion). Gitignore NO usa este canal (es directo via App.tsx).

### F. Eliminacion del HoverCard

- `PaneTabBar.tsx`: quitar el `HoverCard` que envuelve cada tab y sus contenidos
  `TerminalHoverCardContent` / `AgentHoverCardContent` / `HoverRow`. La pestana
  queda con su `title` nativo (cwd, y opcionalmente `modelo . sessionId` si hay
  agente, como tooltip de texto plano).
- La logica de run-on-start (checkbox + input) y de session/transcript/started que
  vivia en esos componentes se traslada al `[...]` del `TerminalPathBar` (B). El
  `onUpdatePanel` que el HoverCard usaba para editar `restoreOnRestart` /
  `persistentCommand` pasa a alimentar el `[...]`.
- Verificar que `transcriptExists` (lo calculaba `AgentHoverCardContent` via
  `native.fsStat`) se recalcula ahora dentro del `[...]` (solo cuando esta
  abierto, para no hacer `fsStat` en cada render de cada tab).

### G. Extraccion compartida de items de menu

Para que explorer y path bars no divergan en labels/iconos/orden, extraer los
items reutilizables (Reveal in Finder, Copy Relative/Absolute, Add to .gitignore,
y los de directorio Set-as-Root / New-Workspace / Open-in-Terminal) a un modulo
de componentes de menu compartidos consumible tanto por `ContextMenu` (explorer,
path bars) como referencia unica. `TreeRow.tsx` pasa a consumir esos items en vez
de tenerlos inline (al menos los que se comparten). Mantener `ContextMenuItem` vs
el contexto donde se usan; si la reutilizacion entre `ContextMenu` y otros tipos
no es directa, extraer al menos las definiciones (label + icono + handler factory)
a datos compartidos y construir los items en cada sitio.

## Casos borde

- Segmento raiz del workspace en el breadcrumb: badge `root` con PinIcon; su menu
  contextual incluye "Set as Workspace Root" (idempotente / no-op si ya es root).
- Terminal sin cwd aun (antes del primer OSC 7): breadcrumb vacio o placeholder;
  el `[...]` sigue disponible para run-on-start.
- Terminal sin agente: sin chip de agente; el `[...]` muestra solo run-on-start.
- Transcript no creado todavia: "not created yet"; Reveal in Finder deshabilitado
  o revelando la carpeta padre si existe.
- Rename/Delete/Duplicate sobre un fichero que esta fuera del explorer root o bajo
  carpeta oculta: se revela lo posible, la accion no se dispara (sin crash).
- Windows: separadores normalizados con `.split(/[\\/]/)`; `relativePath` y
  `gitignoreEntryFor` ya operan sobre forward-slash.
- gitignore: el item solo aparece si `gitignoreEntryFor` devuelve entrada (path
  dentro del repo y distinto del root).

## Plan de tests (quality bar)

- **Breadcrumb del terminal** (helper de segmentos): inside-root, above-root,
  home colapsado, root-es-prefijo-pero-no-frontera, Windows drive letter. Mismos
  casos que el helper del editor.
- **Canal reveal + pendingAction**: test del reducer/handler que, dado un
  `pendingAction`, invoca el handler correcto y lo consume con el nonce (sin
  repetir). Mockear `rowActions`.
- **Menus compartidos**: test de que la lista de items (labels + orden) del menu
  de directorio y de fichero coincide con el contrato (snapshot ligero de los
  ids/labels), para bloquear divergencias con el explorer.
- Reutilizar los tests existentes de `relativePath` / `gitignoreEntryFor` si los
  hay; anadir si faltan.

## Documentacion viva a actualizar (mismo commit que el codigo)

- `docs/ARCHITECTURE.md`: TerminalPathBar con breadcrumb + `[...]`; eliminacion
  del HoverCard de tabs; canal reveal + pendingAction; menus contextuales de path.
- `docs/AGENT_SESSION_RESTORE.md`: la UI de session/transcript/started ahora vive
  en el `[...]` del TerminalPathBar, no en el HoverCard.
- `docs/FORK.md`: si aplica (cambio de UX divergente del upstream).

## Fuera de alcance (YAGNI)

- Open transcript in editor (el usuario eligio solo Reveal in Finder).
- Copy del transcript path (sustituido por Reveal in Finder).
- Cut/Copy/Paste/New File/New Folder en los menus de path (solo el explorer).
- Preview de path/agente al pasar el raton sobre pestanas inactivas (se acepta la
  perdida; la info esta en el panel activo).
- Reveal + accion para gitignore (va directo por App.tsx).
