# BUG-28 [low] parse_renamed asume token original presente; truncamiento produce original_path Some("")

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src-tauri/src/modules/git/parser.rs:48-54` (`parse_renamed`)
`src-tauri/src/modules/git/parser.rs:78-83` (`parse_ordinary`)

## Problema
`tokens.next().unwrap_or("")` se usa para el path original. Si un rename llega truncado al final sin su token original, se construye un file con `original_path = Some("")`. `make_file` no valida path vacio. Igualmente, `parse_ordinary` puede dar `path: ""` si el record tiene exactamente 7 campos (el path queda vacio tras consumir los campos previos).

## Impacto / repro
Un status truncado produce una entrada con `original`/`path` vacio, y el frontend muestra una entrada rara o sin nombre. Es un borde de baja probabilidad (truncamiento de la salida de `git status --porcelain=v2 -z`), pero degrada la UI de Source Control cuando ocurre.

## Fix
Descartar la entrada (`return None`) si el `path` o el `original_path` queda vacio tras el parseo, o no marcarla como rename si falta el token original. Validar en `make_file` (o antes) que el path no es vacio.

## Criterios de aceptacion
- Un record de rename truncado sin su token original no produce una entrada; se descarta (`None`).
- Un record ordinary con path vacio se descarta en lugar de emitir una entrada con `path: ""`.
- Los records validos siguen parseandose igual que antes.

## Verificacion
Rust: `cd src-tauri && cargo clippy && cargo test --locked`. Comprobar que el parser ignora records truncados y sigue parseando correctamente los validos.

## Test a anadir
Subsistema core (git). Anadir test en `src-tauri/src/modules/git/parser.rs` (o su modulo de tests) que pase un record de rename truncado (sin token original) y un record ordinary de 7 campos, verificando que ambos producen `None` en lugar de una entrada con path/original vacio.
