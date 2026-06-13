# F3 - Navegación entre cambios (next / prev hunk) en el diff

**Prioridad: alta.** Esperado en cualquier diff premium (VS Code, GitKraken). Hoy no existe (grep de `hunk`/`next change` en `src/` = 0).

## Objetivo

- Atajos de teclado para saltar al siguiente / anterior cambio dentro del diff abierto (p.ej. `Alt+↓` / `Alt+↑`, o `n` / `p`).
- Botones en la cabecera del diff con contador "3 / 12 changes".
- El cambio destino queda centrado/visible en el viewport (en side-by-side, en ambos paneles sincronizados).

## Diseño técnico

`@codemirror/merge` expone los chunks del diff (`getChunks(state)` / la estructura interna de chunks del `MergeView`). Para el inline actual también hay API de chunks.

- Mantener el índice del chunk activo en estado local del `GitDiffPane`.
- `goToChunk(i)`: `view.dispatch({ effects: EditorView.scrollIntoView(chunk.fromB, { y: "center" }) })` y marcar visualmente el chunk activo.
- Wrap-around opcional al llegar al final.
- Registrar los atajos solo cuando el diff pane está activo (integrar con el registry de `shortcuts.ts`, o un keymap local de CodeMirror para no colisionar con los atajos globales).

## Plan accionable

1. Calcular la lista de chunks del diff (desde `MergeView`/`unifiedMergeView`) y exponer `count` + `activeIndex`.
2. `goToNext()` / `goToPrev()` con `scrollIntoView` centrado; en side-by-side aplicar a ambos editores (el scroll ligado lo mantiene alineado).
3. Cabecera del diff: botones prev/next + contador "N / M changes" + indicador del chunk activo.
4. Atajos: añadir `diff.nextChange` / `diff.prevChange` al registry (`shortcuts.ts`) con handler que solo aplique cuando el panel activo es un diff. Documentar en la ayuda de atajos.
5. Tests del cálculo de chunks y del wrap-around.

## Criterios de aceptación

- `Alt+↓`/`Alt+↑` (o el binding elegido) saltan entre cambios con el destino centrado.
- El contador refleja el número real de hunks y el activo.
- Funciona en inline y en side-by-side (tras F1).

## Relacionado

- Mejor sobre F1, pero funciona con el inline actual.
- Combina con F2 (stage del hunk activo con un atajo).
