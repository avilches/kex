# Git-diff: barra unificada con el editor

## Objetivo

Unificar la cabecera del panel `git-diff` con el estilo de la barra del editor (`EditorPathBar`),
reutilizando lo que tenga sentido, y anadir la capacidad de cambiar entre vista unificada (inline,
actual) y vista de panel doble (split / side-by-side de los dos ficheros del diff).

El panel `git-diff` muestra un diff de un fichero (working tree o commit), que conceptualmente
tiene dos lados: contenido original (antiguo) y contenido modificado (nuevo). Hoy la cabecera es una
franja informativa plana (`h-10`) sin navegacion ni opciones. El editor, en cambio, tiene una barra
rica (`EditorPathBar`) con breadcrumb navegable, selector de lenguaje y dropdown de opciones.

## Alcance

Incluye:

- Barra nueva `GitDiffPathBar` con el estilo de `EditorPathBar` (`h-6`, `border-b border-border/60`,
  `text-[11px]`), que sustituye al header actual de `GitDiffPane`.
- Breadcrumb navegable reutilizando `EditorPathBreadcrumb` en modo solo-lectura.
- Toggle unified/split, con vista de panel doble basada en `MergeView` de `@codemirror/merge`.
- Dropdown `[...]` con `Word wrap` y `Line numbers`, editando la config por-extension existente.
- Manejo de renames (los dos paths del diff) en el breadcrumb.

No incluye (YAGNI):

- Stage/unstage desde el diff, navegacion entre hunks, edicion del diff.
- Whitespace / fold gutter / indent / column ruler en la barra del diff (siguen heredandose por
  extension, pero sin control propio en esta barra).
- Selector de lenguaje en la barra del diff (el lenguaje se resuelve por path, como hoy).

## Decisiones de diseno

| Tema | Decision |
|------|----------|
| Estilo de barra | `h-6`, identico a `EditorPathBar`. Badges de estado compactados a la derecha. |
| wrap / line numbers | Reutilizan la config **por extension** (`editorViewByExt`). El control de la barra escribe con `setEditorViewForExt`, igual que el editor. Marcar wrap en `.ts` afecta a diff y editor de `.ts`. Cero ajustes nuevos. |
| modo unified/split | Pref **global** nueva `diffViewMode: "unified" \| "split"` en el store, visible en `Settings -> Editor` y reflejada por el toggle de la barra. Default `"unified"`. Aplica a todos los diffs. |
| Presentacion de controles | Dropdown `[...]` (estilo `EditorPathBar`) para wrap/line numbers; toggle split como boton aparte. |
| Renames (2 paths) | Breadcrumb del path nuevo + chip inicial sutil `from <oldName>` con `title` al path viejo completo. No se pintan dos breadcrumbs completos. |
| Fallback (binary/large/truncated) | Se conserva la vista patch actual. El toggle split queda deshabilitado (sin editores CodeMirror). Barra y badges visibles. |

## Arquitectura

### Componentes

1. **`GitDiffPathBar.tsx`** (nuevo, `src/modules/editor/`)
   - Props: `path`, `originalPath`, `repoRoot`, `mode`, estado (`isBinary`, `isTooLarge`,
     `truncated`, `stats`, `useFallback`), `viewToggles` (config por-extension), `diffViewMode`,
     `onToggleViewMode`, y los datos del breadcrumb (`workspaceRoot`, `home`, `onRevealPath`).
   - Layout: izquierda breadcrumb (`EditorPathBreadcrumb` read-only) + chip de rename si aplica;
     derecha badges de estado + contadores `+/-` + toggle split + dropdown `[...]`.

2. **`GitDiffSplitView.tsx`** (nuevo, `src/modules/editor/`)
   - Monta `new MergeView({ a, b, parent, ... })` manualmente sobre un `div` via ref.
   - `a` = original (antiguo), `b` = modificado (nuevo); ambos con `EditorState.readOnly.of(true)` +
     `EditorView.editable.of(false)` en sus `extensions`, mas theme (`DIFF_THEME`), lenguaje
     resuelto por path, y `collapseUnchanged: { margin: 3, minSize: 6 }`.
   - Config: `orientation: "a-b"`, `highlightChanges: true`, `gutter: true`, sin `revertControls`.
   - `destroy()` en el cleanup del efecto. Reconstruye al cambiar `originalContent`/`modifiedContent`
     o lenguaje. Razon: `MergeView` es una clase con DOM propio, NO una extension, asi que no puede
     vivir dentro del `<CodeMirror>` de `@uiw/react-codemirror` que usa el modo unified.

3. **`GitDiffPane.tsx`** (modificado)
   - Sustituye el header `298-344` por `<GitDiffPathBar ... />`.
   - Ramifica el cuerpo: `diffViewMode === "split" && !useFallback` -> `<GitDiffSplitView />`;
     en otro caso -> el `unifiedMergeView` actual (intacto) o el patch de fallback.
   - Lee `diffViewMode` de `usePreferencesStore`. Mantiene la herencia por-extension de wrap/line
     numbers ya presente (efectos `248-261`).

4. **`store.ts`** (modificado)
   - `Preferences.diffViewMode: "unified" | "split"`, clave `KEY_DIFF_VIEW_MODE`, default `"unified"`.
   - Setter `setDiffViewMode(mode)`. Lectura via `usePreferencesStore((s) => s.diffViewMode)`.

5. **`EditorSection`** (Settings, modificado)
   - Control para `diffViewMode` (Unified / Split) en la seccion `Editor`, junto al resto de ajustes
     globales del editor.

6. **`PanelContent.tsx`** (modificado)
   - En el `case "git-diff"`, pasa al `GitDiffPane` `workspaceRoot`, `home` y un `onRevealPath`
     desde `EditorChromeContext` (los mismos que ya alimentan `EditorPathBar`).

### Flujo de datos

- **wrap / line numbers:** `resolveEditorView(path, editorViewByExt)` -> reconfigure de compartments
  (ya implementado). El dropdown llama `setEditorViewForExt(extOf(path), value)`.
- **modo split:** `usePreferencesStore(s => s.diffViewMode)`; el toggle llama `setDiffViewMode(...)`.
- **breadcrumb:** `onRevealPath(path)` enfoca el fichero en el explorer (callback de
  `EditorChromeContext`, via `PanelContent`).

### Renames

Funcion pura nueva (`src/modules/editor/lib/diffBreadcrumb.ts`, o helper en el componente) que dado
`path` + `originalPath` decide:

- Sin rename (`originalPath == null || originalPath === path`): solo breadcrumb del path.
- Con rename: breadcrumb del path nuevo + chip `from <basename(originalPath)>` con `title` al
  `originalPath` completo.

`basename` debe ser backslash-aware (`.split(/[\\/]/).pop()`), como el resto del frontend.

## Error handling

- Estado `error` del diff: se mantiene el render de error actual; la barra puede mostrarse vacia o
  con el path, sin toggle ni dropdown operativos.
- Fallback patch (binary/large/truncated): vista patch actual intacta; toggle split deshabilitado
  (atributo `disabled` + `title` explicativo). El dropdown de wrap/line numbers no aplica al patch
  plano y queda oculto en ese modo.
- `MergeView` cleanup: el efecto de montaje siempre llama `destroy()` para no fugar editores al
  cambiar de modo, de fichero o al desmontar el panel.

## Testing

- **Funcion pura de breadcrumb con rename:** test que fija el invariante: con `originalPath`
  distinto de `path` produce el chip `from <oldName>`; sin rename, no. Cubre paths con `/` y `\\`.
- **`setDiffViewMode`:** test de persistencia (escribe la clave) y default `"unified"`.
- `resolveEditorView` ya esta cubierto; no se duplica.

## Ficheros tocados (resumen)

| Fichero | Cambio |
|---------|--------|
| `src/modules/editor/GitDiffPathBar.tsx` | nuevo: barra estilo editor |
| `src/modules/editor/GitDiffSplitView.tsx` | nuevo: montaje `MergeView` side-by-side |
| `src/modules/editor/lib/diffBreadcrumb.ts` | nuevo: helper puro de segmentos/chip de rename (+ test) |
| `src/modules/editor/GitDiffPane.tsx` | usa la barra nueva; ramifica unified/split; pasa props |
| `src/modules/settings/store.ts` | `diffViewMode` + clave + `setDiffViewMode` |
| seccion `EditorSection` (Settings) | control de `diffViewMode` |
| `src/modules/workspaces/PanelContent.tsx` | pasa `workspaceRoot`/`home`/`onRevealPath` al git-diff |
| `docs/ARCHITECTURE.md` | nota del modo split + pref `diffViewMode` |
