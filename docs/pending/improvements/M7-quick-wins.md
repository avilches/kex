# M7 - Quick wins (mejoras pequeñas de alto valor / bajo esfuerzo)

Agrupadas por ser de bajo esfuerzo. Cada una es independiente.

## Rendimiento / arranque

1. **Icon-map en una sola pasada** - `src/modules/explorer/lib/fileIcons.ts` (~2657). `Object.entries(...).reduce((acc,...) => ({...acc, ...}))` esparce el acumulador por iteración (~1300 extensiones) en tiempo de import. Mutar un objeto plano en un único `for...of`. Reduce latencia de arranque y GC. Trivial.
2. **Memoizar resolución de iconos por nombre** - `src/modules/explorer/lib/iconResolver.ts:67-97`. El data-url se cachea por nombre de icono, pero la resolución del nombre (lookup de categoría, loop de extensión, mapa language-id) re-corre por fila por render. Añadir `Map<filename,url>`. Bajo.
3. **Precomputar blob de búsqueda en minúsculas por item de paleta** - `CommandPalette.tsx:399` + `lib/fuzzy.ts:24-25`. `fuzzyScore` pasa a minúsculas query y target por cada candidato en cada keystroke. Precomputar una vez por item. Bajo-medio.
4. **Debounce de la búsqueda incremental de xterm/editor** - `src/modules/header/SearchInline.tsx:106-120`. Cada keystroke hace búsqueda síncrona del buffer completo; un debounce de ~60-90 ms evita stutter en scrollback de 50k líneas. Bajo.
5. **Hoist de mapas reconstruidos por llamada** - `SHORTCUTS_BY_ID` (`CommandPalette.tsx:50` y `shortcuts.ts:368`) y el mapa `onPreferencesChange` (`settings/store.ts:375-399`). Trivial.

## Robustez / UX

6. **Surfacing de errores fs/editor (BUG-30)** - `useFileTree.ts:308,343,359`, `useDocument.ts:149`. Create/rename/delete/autosave fallidos solo hacen `console.error`. Mostrar `toast.error(...)` (Sonner ya cableado). Bajo.
7. **`usePreferencesStore.init` defensivo** - `settings/preferences.ts:20-28`. Sin try/catch; un throw deja `hydrated=false` para siempre. Envolver y caer a defaults. Bajo.
8. **Validar color de tema custom (BUG-19)** - `validateTheme.ts:44`. `CSS.supports("color", v)` + rechazar `url(`/`;`. Bajo.
9. **Menú contextual compartido en resultados de búsqueda del explorer** - `ExplorerSearch.tsx:235-312`. Hasta 200 resultados envuelven cada uno un `ContextMenu` de Radix; usar uno compartido posicionado en right-click. Medio.

## Cross-platform (BUG-29, BUG-33, BUG-34)

10. **Split de paths por `/[\\/]/`** - `FileExplorer.tsx:324`, `TreeRow.tsx:71`, `EditorPane.tsx:276,301`, `useFileTree.ts` (dirname). Helper compartido. Bajo.
11. **`segmentsFromCwd` case-insensitive en Windows** - `pathUtils.ts:17-19`. Bajo.
12. **`cd` quoting para cmd.exe** - `shellQuote.ts:3-8`. Saltar breadcrumb-cd en cmd o usar comillas dobles. Bajo.

## Otras features pequeñas

13. **Resaltado de coincidencias fuzzy en la paleta** - `fuzzyScore` ya calcula los índices de match; devolverlos para poner en negrita los caracteres coincidentes (estilo VS Code). Medio.
14. **Preview de fuente en vivo en settings** - usar `ensureMonoFontsLoaded`; alinea con el handoff `HANDOFF-2026-06-12-font-selector-nerd-font-detection.md`. Medio.
15. **Toggle de word-wrap en el diff** - `wrapCompartment` ya existe en `extensions.ts:11` sin usar en el diff. Bajo.

## Criterios de aceptación

Cada item: cambio aislado, sin regresiones, `pnpm lint`/`check-types`/`test` en verde. Los de cross-platform idealmente con un test que fije el comportamiento con paths backslash.
