# Word wrap: de Settings a barra flotante del editor

Fecha: 2026-06-22
Rama: `word-wrap-bar`

## Objetivo

Sacar el control de "Word wrap" del editor del panel de Settings y exponerlo como un boton flotante
en el propio editor, reutilizando la barra flotante que hoy usa el visor de markdown. La preferencia se
sigue guardando: pasa a ser la unica fuente de verdad del wrap, compartida por el editor de codigo, el
editor de markdown y el visor de diff.

## Estado actual

- `editorWordWrap: boolean` es una preferencia global persistida en `src/modules/settings/store.ts`
  (key `editorWordWrap`, default `false`, setter `setEditorWordWrap`). Se sincroniza via evento Tauri y
  se expone por `usePreferencesStore`.
- `src/settings/sections/GeneralSection.tsx` renderiza un `Switch` "Word wrap" (seccion Editor) que
  llama `setEditorWordWrap`.
- `src/modules/editor/EditorPane.tsx` lee `editorWordWrap` y aplica `EditorView.lineWrapping` via
  `wrapCompartment`, reconfigurando de forma reactiva. No tiene barra propia.
- `src/modules/markdown/MarkdownViewToggle.tsx` es una barra flotante (`absolute right-3 top-3`,
  `backdrop-blur`, borde y sombra) con dos botones `Rendered | Raw`. Cambia entre el preview de markdown
  (`panel.kind === "markdown"`) y el editor del `.md` (`panel.kind === "editor"`).
- `src/modules/editor/GitDiffPane.tsx` tiene su propio wrap **local** (`useState(false)`) con un boton
  inline en su header horizontal. No usa la preferencia global.
- `src/modules/workspaces/PanelContent.tsx` monta `MarkdownViewToggle` en el caso `editor` (solo si el
  path es `.md`) y `MarkdownPreviewPane` lo monta en el caso `markdown`.

## Diseno

### Decision central

El wrap pasa a ser **una unica preferencia global** (`editorWordWrap`) compartida por los tres sitios:
editor de codigo, editor de markdown y diff. Se elimina el estado local del diff. Togglear el wrap en
cualquier sitio togglea el global y persiste.

### Componente 1: `WrapToggleButton` (nuevo, compartido)

Ubicacion: `src/modules/editor/WrapToggleButton.tsx` (exportado por el barrel del modulo editor si existe,
o importado por path `@/...`).

- Presentacional minimo. Lee `editorWordWrap` de `usePreferencesStore` y llama `setEditorWordWrap` al click.
- Icono `TextWrapIcon` (hugeicons), `size={12}`.
- Estilo identico al boton actual del diff: `flex size-[22px] items-center justify-center rounded
  transition-colors`, color `text-foreground` cuando esta activo, `text-muted-foreground
  hover:text-foreground` cuando no.
- `title` dinamico: "Disable word wrap" / "Enable word wrap".
- Es la unica implementacion del control de wrap, reutilizada en los tres sitios.

### Componente 2: barra flotante reutilizable (generalizar `MarkdownViewToggle`)

La barra `absolute right-3 top-3` con backdrop blur pasa a componer dos zonas:

- Zona opcional `[ Rendered | Edit ]`: solo se renderiza cuando el panel es markdown (preview o editor de
  `.md`). Mantiene `renderedDisabled` / `renderedHint` (hint "Save to preview" cuando hay cambios sin
  guardar).
- Zona fija `[wrap]`: siempre presente, es el `WrapToggleButton`.

Cambios concretos:

- El boton que hoy muestra `Raw` cambia su **label visible** a `Edit`. El valor interno del callback
  (`onChange("raw")`) se mantiene tal cual para no tocar la logica de `panel.kind` ni el store de vista de
  markdown. Solo cambia el texto.
- Para el editor normal (no markdown) la barra se renderiza con la zona del toggle oculta: solo muestra
  `[wrap]`.

Opcion de implementacion (a decidir en el plan, ambas validas):
  a. Mantener `MarkdownViewToggle` como esta y crear un contenedor `EditorOverlayBar` que envuelva
     `[toggle opcional] + WrapToggleButton` con el mismo estilo de barra.
  b. Generalizar `MarkdownViewToggle` para aceptar una prop que oculte el toggle y anada el
     `WrapToggleButton`, renombrandolo a algo mas neutro.
La preferencia es (a): el estilo de la barra (posicion, blur, borde) vive en un solo sitio y los
contenidos se componen, manteniendo cada pieza con una responsabilidad clara.

### Componente 3: `PanelContent.tsx`

- caso `editor` con path `.md`: barra flotante con `[ Rendered | Edit ] [wrap]`, conservando
  `renderedDisabled={panel.dirty}` y `renderedHint="Save to preview"`.
- caso `editor` sin `.md`: barra flotante con solo `[wrap]`.
- caso `markdown` (via `MarkdownPreviewPane`): barra flotante con `[ Rendered | Edit ] [wrap]`. El wrap se
  muestra siempre, aunque en modo preview no tenga efecto visible inmediato (togglea el global, que aplica
  al abrir el editor).

### Componente 4: `GitDiffPane.tsx`

- Eliminar `const [wordWrap, setWordWrap] = useState(false)` y el boton inline del header.
- Colocar `WrapToggleButton` en el mismo lugar del header (lado derecho, junto a las stats).
- El `wrapCompartment` pasa a leer `editorWordWrap` global en su valor inicial y a reconfigurarse de forma
  reactiva cuando cambia la preferencia (mismo patron que `EditorPane`).

### Componente 5: `GeneralSection.tsx`

- Eliminar el `SettingRow` "Word wrap" y la lectura/uso de `editorWordWrap` / `setEditorWordWrap` en este
  componente.
- El tipo, default, persistencia, sincronizacion por evento y el export `setEditorWordWrap` del store se
  mantienen intactos.

## Flujo de datos

1. Usuario pulsa el `WrapToggleButton` (en editor, markdown o diff).
2. `setEditorWordWrap(next)` escribe en el store persistido y emite el evento Tauri.
3. `usePreferencesStore` actualiza el estado reactivo en todas las ventanas.
4. `EditorPane`, `GitDiffPane` y el editor del `.md` reconfiguran su `wrapCompartment` segun el nuevo valor.

## No incluido (YAGNI / fuera de scope)

- No se mueve visualmente el boton del diff a la barra flotante: se queda en su header, solo cambia su
  fuente de estado (de local a global).
- No se anade wrap por-panel ni overrides locales: una sola preferencia global.
- No se cambia el comportamiento del preview de markdown mas alla de mostrar el icono de wrap.

## Verificacion

- `pnpm lint`, `pnpm check-types`, `pnpm test`.
- Comprobacion manual:
  - El `Switch` "Word wrap" ya no aparece en Settings.
  - Toggle de wrap desde el editor de codigo: aplica y persiste tras reabrir.
  - Markdown: la barra muestra `Rendered | Edit` y el icono de wrap; `Edit` abre el editor del `.md`.
  - Diff: el boton de wrap del header refleja y modifica la preferencia global.
  - El wrap es coherente entre los tres sitios (cambiar en uno se refleja en los demas).

## Documentacion viva a actualizar

- `docs/ARCHITECTURE.md` / `docs/FORK.md` si procede (control de wrap reubicado, preferencia global
  unica). Confirmar en el plan que el cambio amerita nota.
