# BUG-11 [medium] El flag truncated del backend se ignora por completo en el cliente

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
Tipo `GitDiffContentResult.truncated` en `src/lib/native.ts:72`; producido en `src-tauri/src/modules/git/operations.rs:259,788` y `src-tauri/src/modules/git/process.rs:385-406`; nunca leido en `src/modules/editor` | `src/modules/source-control` | `src/modules/git-history`.

## Problema
Cuando un fichero supera `MAX_OUTPUT_BYTES` (2 MB) el backend trunca y marca `truncated: true`. El cliente jamas lo muestra.

## Impacto / repro
El diff de un fichero mayor de 2 MB se muestra cortado en silencio; riesgo de revisar mal un cambio antes de commitear. Repro: generar un diff de un fichero superior a 2 MB y abrirlo en el panel de diff; el contenido aparece cortado sin ninguna senal visual.

## Fix
Propagar `truncated` al `LoadState` (`src/modules/source-control/GitDiffPane.tsx:105`) y renderizar un badge "Truncated - showing first 2 MB" junto a los de binario / large file (`GitDiffPane.tsx:258-266`).

## Criterios de aceptacion
- El flag `truncated` del `GitDiffContentResult` se propaga al `LoadState` del panel de diff.
- Cuando `truncated` es true, se muestra un badge "Truncated - showing first 2 MB" coherente con los badges de binario y large file existentes.
- El badge no aparece cuando el contenido no esta truncado.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`.

## Test a anadir
No aplica como cambio de subsistema core (solo UI de presentacion del flag ya existente). Si la infraestructura de tests del panel lo permite, anadir un test de render que verifique que el badge aparece solo con `truncated: true`.
