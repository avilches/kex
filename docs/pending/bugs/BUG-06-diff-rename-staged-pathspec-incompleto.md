# BUG-06 [high] diff_content de un rename staged no incluye el path original en el pathspec, fallback_patch incompleto

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src-tauri/src/modules/git/operations.rs:217` y `src-tauri/src/modules/git/operations.rs:250`.

## Problema
Para un rename staged, `diff_inner(Some(&rel_path), staged=true)` filtra solo por el nuevo path; `original_rel` se calcula para `git show HEAD:{spec}` pero NO se anade al pathspec del `diff_inner`, a diferencia de `commit_file_diff` (operations.rs:765) que si anade ambos. El doble panel principal funciona (usa `git show`), pero el `fallback_patch` (binarios, o cuando xterm cae al fallback) queda vacio o incompleto.

## Impacto / repro
Hacer stage de un rename con cambios degrada el `fallback_patch`: queda vacio o incompleto para ese fichero.

## Fix
En `diff_content`, construir el pathspec de `diff_inner` incluyendo `original_rel` cuando difiere de `rel_path`, igual que ya hace `commit_file_diff`. Asi el `git diff` que alimenta el `fallback_patch` ve ambos extremos del rename.

## Criterios de aceptacion
- El `fallback_patch` de un rename staged con cambios contiene el diff completo.
- El caso sin rename (mismo path) no cambia de comportamiento.
- Coherente con `commit_file_diff`.

## Verificacion
Rust: `cd src-tauri && cargo clippy && cargo test --locked`. Comprobar el nuevo test de rename staged.

## Test a anadir
Subsistema core git. Anadir test: stage de un rename con modificacion de contenido; verificar que el `fallback_patch` devuelto por `diff_content` no esta vacio y refleja el rename + los cambios.
