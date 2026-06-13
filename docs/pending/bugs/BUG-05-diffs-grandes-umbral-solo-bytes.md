# BUG-05 [high] Diffs grandes (hasta 2 MB) se renderizan enteros: umbral solo por bytes, sin guardia por lineas

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/editor/GitDiffPane.tsx:43` (LARGE_FILE_THRESHOLD = 256*1024), `src/modules/editor/GitDiffPane.tsx:196-199`; backend `src-tauri/src/modules/git/types.rs:6` (MAX_FILE_BYTES = 2 MB).

## Problema
El fallback a patch solo se activa cuando un lado supera 256 KB en bytes, pero el backend permite 2 MB. Un fichero de ~240 KB con miles de lineas cortas (minified, lockfile) pasa el umbral por bytes y va al editor completo. `unifiedMergeView` con `highlightChanges` calcula el diff completo de forma sincrona en el hilo principal al montar. No hay limite por numero de lineas ni calculo en worker.

## Impacto / repro
Un fichero minified o lockfile de ~200 KB dispara un diff sincrono que bloquea el render. El umbral por bytes es un proxy pobre del coste real, que escala con el numero de lineas y de cambios.

## Fix
Anadir un umbral por lineas ademas del de bytes: contar `\n` sin materializar el array de lineas, y caer al `fallback_patch` cuando supere ~5-10k lineas. Idealmente, mover el calculo del diff a un Web Worker (ver `review/improvements/M5-diff-grandes-worker.md`).

## Criterios de aceptacion
- Un fichero por debajo del umbral de bytes pero con muchas lineas (minified/lockfile) cae al fallback en lugar de bloquear el render.
- El conteo de lineas no materializa un array intermedio.
- Los diffs normales siguen mostrandose en el editor completo.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar que el umbral por lineas dispara el fallback en el caso minified.

## Test a anadir
No aplica como invariante de subsistema core Rust. Cobertura recomendada: test de la logica de decision (bytes y lineas) que selecciona editor vs fallback.
