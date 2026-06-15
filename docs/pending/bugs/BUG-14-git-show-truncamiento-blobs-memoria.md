# BUG-14 [medium · memoria] git_show_text/diff_content no propagan truncamiento de blobs y cargan todo en memoria

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src-tauri/src/modules/git/process.rs:135-153`; `src-tauri/src/modules/git/operations.rs:227-249`

## Problema
El lado original/modified viene de `git show`, cuyo stdout solo esta limitado por `MAX_OUTPUT_BYTES`. Para un fichero de ~2 MB se transfieren hasta ~4 MB por IPC mas el `fallback_patch` (3 copias: blob original, modificado, patch), y no hay senal al frontend de que `git show` se trunco.

## Impacto / repro
Pico de RAM y posible doble panel truncado en silencio. Contradice "eficiente en memoria". Repro: abrir el diff de doble panel de un fichero de ~2 MB que ha cambiado; observar el pico de RAM por las multiples copias y que el contenido puede aparecer truncado sin ninguna senal.

## Fix
Comprobar `output.truncated` en `git_show_text` y propagar `original_truncated` / `modified_truncated` a `GitDiffContentResult`; o rechazar blobs grandes con `cat-file -s` antes de `show`.

## Criterios de aceptacion
- `git_show_text` comprueba `output.truncated` y lo propaga al resultado.
- `GitDiffContentResult` expone `original_truncated` y `modified_truncated` (o equivalente), y el frontend puede senalar el truncamiento en cada lado del doble panel.
- Alternativa aceptable: los blobs que superan el limite se rechazan via `cat-file -s` antes de hacer `show`, evitando el pico de RAM.

## Verificacion
Rust: `cd src-tauri && cargo clippy && cargo test --locked`. Frontend (si se anaden campos al tipo y su consumo): `pnpm lint`, `pnpm check-types`, `pnpm test`.

## Test a anadir
Subsistema core (git / IPC). Anadir test que, ante un blob que supera `MAX_OUTPUT_BYTES`, verifique que `git_show_text` marca el truncamiento y que `GitDiffContentResult` lo propaga en el lado correspondiente (`original_truncated` / `modified_truncated`). Si se opta por el rechazo via `cat-file -s`, testear que blobs grandes se rechazan antes del `show`.
