# Focus on Explorer

## Objetivo

Anadir una accion "Focus on Explorer" al menu contextual de cualquier tab que represente
un fichero. Al activarla, el fichero queda seleccionado y visible (scroll incluido) en el
panel Explorer, abriendo antes las carpetas padre y, si hace falta, cambiando el modo y el
root del explorer para que el fichero entre en la vista.

## Alcance

- La opcion aparece en toda tab cuyo panel tenga un `path` de fichero: `editor`, `markdown`,
  `git-diff`, `git-commit-file`. No aparece en `terminal`, `browser` ni `git-history`.
- Icono: `CrosshairIcon` de hugeicons (mirilla: circulo con cruz y punto central).
- La accion **no** roba el foco al editor. Solo abre el right panel en la pestana Explorer,
  selecciona/resalta el fichero y hace scroll hasta el. El usuario sigue con el cursor en el
  editor.

Fuera de alcance: cualquier shortcut de teclado para esta accion (es solo de menu contextual),
y revelar ficheros que no existen en disco (un `git-commit-file` de un commit donde el fichero
fue borrado simplemente no se encontrara y la accion no tendra efecto visible).

## Comportamiento

Sea `F` el path absoluto (forward-slash) del fichero de la tab, y sea `currentRoot` el root
efectivo de la vista actual del explorer (resuelto por `resolveExplorerRoot` segun el modo
activo).

1. **La vista actual ya contiene `F`** (`currentRoot` es ancestro de `F`, comparado con
   `isUnder`): no se cambia ni el modo ni el root. Se expanden las carpetas intermedias entre
   `currentRoot` y `dirname(F)`, se selecciona `F`, se hace scroll hasta el. Esto aplica sea
   cual sea el modo actual (filesystem, pinned, git, terminal).

2. **La vista actual NO contiene `F`**: se cambia el modo a `filesystem` y se fija el nuevo
   `fsRoot` como el **ancestro comun** entre el root de filesystem de referencia
   (`workspace.fsRoot`, o `home` si es `null`) y `F`:
   - Si ese fsRoot de referencia ya es ancestro de `F`, el ancestro comun es el mismo fsRoot,
     asi que el root no se mueve: solo se cambia de modo y se revela.
   - Si no, el root sube al directorio comun mas profundo que contiene a ambos, y se expanden
     las carpetas hasta `F`.
   - Caso limite (sin ancestro comun real, p. ej. distinto drive en Windows): el nuevo root es
     `dirname(F)`, de modo que el fichero queda directamente bajo la raiz y siempre es visible.

En ambos casos, si el right panel esta cerrado se abre, y la pestana activa pasa a `explorer`.

## Arquitectura

### Nucleo puro (testeable)

Funciones sin dependencias de React, en `src/modules/workspaces/lib/explorerRoot.ts` (junto a
`resolveExplorerRoot`, `isFilesystemRoot`, `parentRoot`) o en `lib/pathUtils.ts` segun encaje
mejor:

- `commonAncestor(a: string, b: string): string | null`
  Directorio ancestro comun mas profundo de dos paths absolutos forward-slash. Devuelve `null`
  si no comparten prefijo de segmentos (distinto drive/raiz).

- `ancestorsToExpand(root: string, file: string): string[]`
  Lista ordenada de directorios desde `root` (inclusive) hasta `dirname(file)` (inclusive) que
  hay que expandir para que `file` sea visible. Devuelve `[]` si `root` no es ancestro de
  `file`.

- `resolveFocusTarget(input: { file: string; mode: ExplorerRootMode; currentRoot: string | null; fsRoot: string | null; home: string | null }): { nextMode: ExplorerRootMode; nextFsRoot: string } | null`
  Decision central. Devuelve `null` cuando la vista actual ya contiene el fichero (no hay que
  cambiar nada). En caso contrario devuelve el modo destino (`"filesystem"`) y el `fsRoot`
  destino calculado con `commonAncestor`, con el fallback a `dirname(file)`.

Estas tres funciones llevan tests unitarios que fijan los invariantes (vista ya contiene el
fichero, fsRoot ancestro, ancestro comun real, fallback sin ancestro comun, caso `home`).

### Shell imperativo

**`App.tsx`** orquesta el cambio de estado y dispara la peticion de revelado:

- Nuevo estado `revealRequest: { path: string; nonce: number } | null`. El `nonce` permite
  repetir la accion sobre el mismo fichero (nueva referencia cada vez).
- `handleFocusOnExplorer(file: string)`:
  1. `setRightPanelOpen(true)` y `setRightPanelActiveTab("explorer")`.
  2. Calcula `resolveFocusTarget({ file, mode: activeRootMode, currentRoot: explorerRoot, fsRoot: fsFolderRoot, home })`.
  3. Si devuelve target: aplica `setActiveRootMode(target.nextMode)` y, si cambia,
     `setFsRoot(activeWorkspace.id, target.nextFsRoot)`.
  4. `setRevealRequest({ path: file, nonce: nonce + 1 })`.
- `revealRequest` se pasa al `RightPanel` y de ahi al `FileExplorer`.

**`FileExplorer.tsx`** ejecuta el revelado de forma reactiva (driver basado en effect, robusto
frente a la recarga async del arbol):

- Recibe `revealRequest` como prop. Un `ref` guarda la ultima peticion ya consumida.
- Effect que depende de `[revealRequest, rootPath, tree.expanded, tree.nodes, entryIndexByPath]`:
  1. Si no hay peticion nueva, return.
  2. Si `rootPath` aun no es ancestro de `F` (el cambio de root todavia no se ha propagado),
     return y espera al siguiente render.
  3. Calcula `ancestorsToExpand(rootPath, F)`. Para cada dir: si no esta en `tree.expanded`,
     `tree.expand(dir)` (marca pendiente); si esta pero su `status` no es `"loaded"`, marca
     pendiente.
  4. Si hay algo pendiente, return (el cambio de `nodes`/`expanded` re-disparara el effect).
  5. Cuando todos los ancestros estan cargados y `entryIndexByPath.has(F)`:
     `setSelectedPath(F)` + `requestAnimationFrame(() => scrollEntryIntoView(F))`. Marca la
     peticion como consumida en el `ref`. **No** se llama a `focus()`.

Este driver reutiliza `tree.expand`, `setSelectedPath`, `scrollEntryIntoView` y
`entryIndexByPath`, que ya existen.

### Cableado del menu

**`PaneTabBar.tsx`**: nuevo `ContextMenuItem` "Focus on Explorer" con `CrosshairIcon`, visible
solo cuando el panel tiene fichero. Helper `panelFilePath(panel): string | null`:

- `editor` / `markdown`: `panel.path` (ya absoluto).
- `git-diff` / `git-commit-file`: `panel.path` resuelto a absoluto (si es relativo, combinar
  con `panel.repoRoot`), normalizado a forward-slash.
- resto: `null`.

El item llama `onFocusOnExplorer?.(absPath)`.

**Prop drilling** del callback `onFocusOnExplorer?: (file: string) => void` siguiendo el patron
existente de los demas callbacks de tab: `App.tsx` -> `WorkspaceView`/`SplitNodeView` ->
`PaneView` -> `PaneTabBar`.

## Plan de pruebas

Tests unitarios de las tres funciones puras (Vitest, junto a los de `explorerRoot`):

- `commonAncestor`: prefijo comun normal, uno ancestro del otro, sin prefijo comun (`null`),
  raiz `/`.
- `ancestorsToExpand`: cadena normal, `root === dirname(file)` (un solo elemento), `root` no
  ancestro (`[]`).
- `resolveFocusTarget`: vista actual contiene el fichero en cada modo (`null`); modo no
  filesystem sin contener -> `filesystem` + ancestro comun; fsRoot ya ancestro -> mismo root;
  sin ancestro comun -> `dirname(file)`; `fsRoot` null usando `home`.

Verificacion manual: abrir un fichero profundo, cambiar el explorer a Follow Git / Follow
Terminal / Workspace Root, hacer Focus on Explorer y confirmar que (a) si la vista lo contiene
se revela sin cambiar de modo, (b) si no lo contiene salta a File System con el root correcto y
lo revela, (c) el foco permanece en el editor, (d) funciona sobre una tab que no es la activa.

## Comprobaciones de calidad

`pnpm lint`, `pnpm check-types`, `pnpm test`. (Sin cambios en Rust.)
