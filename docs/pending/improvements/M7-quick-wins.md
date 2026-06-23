# M7 - Quick wins (mejoras pequeñas de alto valor / bajo esfuerzo)

Agrupadas por ser de bajo esfuerzo. Cada una es independiente.

## Rendimiento / arranque

1. ~~Icon-map en una sola pasada~~ HECHO (d0b81c4)
2. ~~Memoizar resolución de iconos por nombre~~ HECHO: `iconResolver.ts:70-109` cachea por nombre de fichero (`fileIconCache.get/set`).
3. ~~Precomputar blob de búsqueda en minúsculas por item de paleta~~ HECHO: `CommandPalette.tsx:393-413` precomputa con `buildSearchBlobs` y `rankCommands` usa `fuzzyBestLower`.
4. ~~Debounce de la búsqueda incremental de xterm/editor~~ HECHO: `SearchInline.tsx:167-170` aplica debounce de 75 ms.
5. ~~Hoist de mapas reconstruidos por llamada~~ HECHO parcial: SHORTCUTS_BY_ID (9dd9fc7); pendiente: mapa `onPreferencesChange` en `settings/store.ts:375-399`.

## Robustez / UX

6. ~~Surfacing de errores fs/editor (BUG-30)~~ HECHO: create/rename/delete/duplicate/paste/trash/move en `useFileTree.ts` y autosave en `useDocument.ts:156` ya muestran `toast.error(...)`.
7. ~~`usePreferencesStore.init` defensivo~~ HECHO (22ae7f2)
8. ~~Validar color de tema custom (BUG-19)~~ HECHO (9186292)
9. ~~Menú contextual compartido en resultados de búsqueda del explorer~~ HECHO: `ExplorerSearch.tsx:297` envuelve el scroll con un solo `ContextMenu`, no uno por resultado.

## Cross-platform (BUG-29, BUG-33, BUG-34)

10. ~~Split de paths por `/[\\/]/`~~ HECHO: `useFileTree.ts` y los call sites ya usan `.split(/[\\/]/)`.
11. ~~`segmentsFromCwd` case-insensitive en Windows~~ HECHO (bf3440f)
12. ~~`cd` quoting para cmd.exe (BUG-34)~~ HECHO: `shellQuote.ts:3-8` ya usa comillas dobles (validas en cmd.exe y PowerShell).

## Otras features pequeñas

13. **Resaltado de coincidencias fuzzy en la paleta** - `fuzzyScore` ya calcula los índices de match; devolverlos para poner en negrita los caracteres coincidentes (estilo VS Code). Medio.
14. **Preview de fuente en vivo en settings** - usar `ensureMonoFontsLoaded`; alinea con el handoff `HANDOFF-2026-06-12-font-selector-nerd-font-detection.md`. Medio.
15. ~~Toggle de word-wrap en el diff~~ HECHO (ec406ba)

## Criterios de aceptación

Cada item: cambio aislado, sin regresiones, `pnpm lint`/`check-types`/`test` en verde. Los de cross-platform idealmente con un test que fije el comportamiento con paths backslash.
