# Diseno: word wrap por tipo de fichero

## Contexto

Hoy el word wrap del editor es un unico booleano global `editorWordWrap` en
`src/modules/settings/store.ts` (persiste). `EditorPane` y `GitDiffPane` lo leen y lo
aplican via `wrapCompartment` (CodeMirror Compartment). El `WrapToggleButton` de la barra
flotante lo cambia para todos los editores a la vez.

Problema: el wrap no deberia ser una preferencia unica para todo. Para codigo lo correcto
es OFF (scroll lateral, como VS Code / JetBrains); para prosa (Markdown, texto plano) es
comodo tenerlo ON. Y el usuario espera poder forzarlo por fichero sin afectar al resto.

## Decisiones tomadas

- **Default por tipo**: prosa (`.md`, `.markdown`, `.mdx`, `.txt`) abre con wrap ON; el
  resto (codigo y demas) con wrap OFF. Los logs quedan OFF (su estructura por linea se lee
  mejor sin wrap).
- **Override por panel, persistido**: si el usuario pulsa el toggle, solo cambia ESE panel
  y se recuerda al reabrir el workspace. Modelo VS Code (override por lenguaje + toggle por
  editor). Se elimina el booleano global.
- **Git diff**: respeta el mismo default por tipo segun el path del fichero diffeado.

## Diseno tecnico

### Deteccion de tipo

Nuevo helper en `src/lib/utils.ts`, junto a `isMarkdownPath`:

```ts
export function shouldWrapByDefault(path: string): boolean {
  return /\.(md|markdown|mdx|txt|text)$/i.test(path);
}
```

(Markdown reutiliza la extension; se anade texto plano. Conjunto pequeno y explicito.)

### Estado: override por panel

- `Panel` (kind `editor`) en `src/modules/workspaces/lib/types.ts` gana un campo opcional
  `wordWrapOverride?: boolean`. Compatible hacia atras: si falta, no hay override. Se
  persiste con el resto del modelo Panel en `workspace-state.json`.
- Wrap efectivo de un panel: `panel.wordWrapOverride ?? shouldWrapByDefault(panel.path)`.
- Nueva accion en `useWorkspaces` (p. ej. `setPanelWordWrapOverride(panelId, value)`),
  analoga a `setPanelView`, que muta el campo y dispara la persistencia debounced.

### Aplicacion en el editor

- `EditorPane` recibe el wrap efectivo (calculado en `PanelContent` a partir de
  `panel.wordWrapOverride` y `shouldWrapByDefault(panel.path)`), no el booleano global.
- `wrapCompartment` se inicializa con ese valor (lineas 139-143) y se reconfigura cuando
  cambia (useEffect, hoy en 173-176), igual que ahora pero leyendo el valor efectivo en
  vez del global.
- `WrapToggleButton` deja de llamar a `setEditorWordWrap`. Pasa a recibir el estado
  efectivo y un callback (desde `PanelContent`, como ya se hace con `onSetMarkdownView`)
  que llama a `setPanelWordWrapOverride(panelId, !effectivo)`.

### Git diff

- `GitDiffPane` ya conoce el path del fichero diffeado y tiene su propio `WrapToggleButton`
  en la cabecera. Recibe `wordWrap` (efectivo) y `onToggleWordWrap` como props desde
  `PanelContent`, sustituyendo la lectura del global en la init y reconfigure de su
  `wrapCompartment`.
- Igual que el editor: los paneles `git-diff` y `git-commit-file` ganan `wordWrapOverride?` y
  el toggle del diff escribe ese override por panel (`setPanelWordWrapOverride` acepta los
  tres kinds).

### Limpieza del global

- Eliminar `editorWordWrap` de `Preferences`, `DEFAULT_PREFERENCES`, las claves de
  persistencia y `setEditorWordWrap` en `store.ts`, y sus lecturas en `EditorPane`,
  `GitDiffPane` y `WrapToggleButton`. Migracion: una preferencia obsoleta en el store no
  rompe nada (se ignora al cargar); no hace falta migracion activa.

## Archivos afectados

- `src/lib/utils.ts`: helper `shouldWrapByDefault`.
- `src/modules/workspaces/lib/types.ts`: campo `wordWrapOverride?` en Panel editor.
- `src/modules/workspaces/lib/useWorkspaces.ts`: accion `setPanelWordWrapOverride`.
- `src/modules/workspaces/PanelContent.tsx`: calcular wrap efectivo, pasarlo + callback.
- `src/modules/editor/EditorPane.tsx`: usar wrap efectivo en `wrapCompartment`.
- `src/modules/editor/WrapToggleButton.tsx`: estado + callback por panel en vez de global.
- `src/modules/editor/GitDiffPane.tsx`: default por tipo segun el path del diff.
- `src/modules/settings/store.ts`: eliminar `editorWordWrap`.

## Fuera de alcance

- Hacer configurable la lista de tipos "prosa" desde Settings (hardcodeada por ahora).
- Word wrap en el terminal (no aplica, reflow).
- Anadir mas extensiones de prosa (`.rst`, `.adoc`, `.org`): faciles de sumar luego al
  helper si se piden.

## Verificacion

- `pnpm check-types`, `pnpm exec biome lint ./src`, `pnpm test` en verde.
- Test unitario de `shouldWrapByDefault` (md/markdown/mdx/txt -> true; ts/js/json/log ->
  false). Bloquea el invariante del default por tipo.
- Manual: abrir `.md` -> wrap on; abrir `.ts` -> wrap off; toggle en el `.ts` -> wrap on
  solo en ese panel; cerrar y reabrir workspace -> el override persiste; diff de un `.md`
  -> wrap on, diff de codigo -> off.
