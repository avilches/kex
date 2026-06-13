# F1 - Diff de git en doble panel (side-by-side) real

**Prioridad: MÁXIMA.** Es la feature estrella del producto según la dirección del proyecto ("un buen diff de git en doble panel") y hoy no existe.

## Problema

El diff actual usa `unifiedMergeView` de `@codemirror/merge` (`src/modules/editor/GitDiffPane.tsx:5,207`): un merge view **unificado/inline**, un solo editor que intercala los bloques borrados. No hay dos editores, ni dos columnas de números de línea, ni scroll sincronizado entre paneles. El grep de `MergeView`/`side-by-side`/`sideBySide` en `src/` no devuelve ningún uso de producción.

La dependencia `@codemirror/merge` (`package.json:44`, `^6.12.1`) **ya incluye** el componente `MergeView` side-by-side. Migrar a él tiene coste de bundle ~cero.

## Objetivo

Diff side-by-side de calidad premium (referencia: VS Code, GitKraken):

- Dos editores (a = original, b = modificado) lado a lado.
- Gutters de número de línea independientes a cada lado.
- Scroll sincronizado nativo (lo provee `MergeView` con `gutter` + `revertControls` opcional).
- Resaltado de añadido/borrado y resaltado **intra-línea** (`cm-changedText`, ya estilado en `DIFF_THEME`, `GitDiffPane.tsx:51-60`).
- `collapseUnchanged` para plegar contexto no modificado.
- Reusar el lenguaje (`languageCompartment`), tema, word-wrap y vim de `extensions.ts`.
- Resolver de paso BUG-04 (reconstrucción completa) y BUG-05 (diffs grandes) y BUG-11 (badge truncated).

## Diseño técnico

`MergeView` no es una `Extension` sino un widget propio con su ciclo de vida, así que para este panel hay que **abandonar `<CodeMirror>` de `@uiw/react-codemirror`** y montar `MergeView` directamente sobre un `ref`.

```ts
import { MergeView } from "@codemirror/merge";

// en GitDiffPane, dentro de un useEffect keyed por `key` (identidad lógica del diff):
const view = new MergeView({
  a: { doc: originalContent, extensions: [readOnlyExt, langA, themeCompartment.of(themeExt), ...] },
  b: { doc: modifiedContent, extensions: [readOnlyExt, langB, themeCompartment.of(themeExt), ...] },
  parent: hostRef.current,
  collapseUnchanged: { margin: 3, minSize: 4 },
  highlightChanges: true,
  gutter: true,
});
return () => view.destroy();
```

- **Tema sin reconstruir (BUG-04):** usar un `Compartment` para el tema en ambos lados; al cambiar de tema, `view.a.dispatch({ effects: themeCompartment.reconfigure(newTheme) })` (y `view.b`), sin recrear el `MergeView`.
- **Contenido sin reconstruir:** cuando llega `originalContent`/`modifiedContent` para el mismo `key`, no recrear: `MergeView` no expone setDoc directo por lado de forma trivial, así que la recreación se acota a cambios reales de `key`; el churn de re-render por identidad inestable de `source` (BUG-26) se elimina memoizando `source` en `PanelContent`.
- **Diffs grandes (BUG-05):** antes de montar, contar líneas (`countNewlines(content)` sin materializar array) y bytes. Si supera umbral (p.ej. > 5k líneas o > 256 KB en cualquier lado), no montar `MergeView`; mostrar el `fallbackPatch` virtualizado o un estado "Diff demasiado grande - abrir como patch". Idealmente el cómputo del diff va a un Web Worker (ver M5).
- **Badge truncated (BUG-11):** si `result.truncated`, renderizar badge "Truncated - showing first 2 MB" en la cabecera.
- **CRLF (BUG-02):** se arregla en backend; este panel asume contenido ya normalizado.

## Plan accionable

1. Crear `src/modules/editor/DiffMergeView.tsx`: componente que monta/desmonta `MergeView` sobre un `ref`, recibe `{ original, modified, lang, theme, readOnly, wordWrap }`, gestiona el `Compartment` de tema y el `destroy()` en cleanup. Tests de montaje/desmontaje (sin leaks de view).
2. Extraer de `extensions.ts` los extensions reutilizables por lado (lenguaje, tema, wrap, vim, readOnly) en helpers que sirvan tanto al editor normal como a cada lado del merge.
3. Reescribir `GitDiffPane.tsx` para usar `DiffMergeView` en lugar de `unifiedMergeView`. Mantener toda la lógica de carga/cache/estados (`LoadState`, fallback, binario) intacta.
4. Añadir guardia por líneas además de bytes (BUG-05) y badge truncated (BUG-11).
5. Memoizar `source` en `PanelContent.tsx:127` (BUG-26) y pasar stats reales de numstat al panel (BUG-27).
6. Verificar resaltado intra-línea (`cm-changedText`/`cm-deletedText`) en ambos paneles con el `DIFF_THEME`.
7. Tests: diff con cambios, fichero nuevo (original vacío), fichero borrado, binario (fallback), rename, diff grande (fallback), tema cambiado en caliente (sin reconstrucción).

## Criterios de aceptación

- Abrir un diff desde Source Control o Git History muestra dos columnas con scroll ligado y números de línea a ambos lados.
- Cambiar el tema con un diff abierto no congela el frame ni recrea el editor.
- Un fichero de ~1 MB con miles de líneas no bloquea la UI (cae a fallback o worker).
- Resaltado intra-línea visible en líneas modificadas.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde.

## Relacionado

- Depende de BUG-02 (CRLF) para que el side-by-side no sea ruido.
- Habilita F2 (stage por hunk) y F3 (navegación de hunks).
- M5 (diff en worker) para subir los umbrales.
- Actualizar `docs/ARCHITECTURE.md:123` y `D7` en `review/DOCS.md`.
