# BUG-12 [medium · seguridad] TOCTOU: auto-autorizacion del repo root ascendente extiende el alcance hacia arriba

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src-tauri/src/modules/git/operations.rs:45-46`, `src-tauri/src/modules/git/operations.rs:103-104`; `src-tauri/src/modules/git/workspace.rs:32-35`

## Problema
`resolve_repo_in_authorized` / `panel_snapshot` toman el cwd autorizado, ejecutan `git rev-parse --show-toplevel` y auto-autorizan el root devuelto sin comprobar que caiga dentro de un root ya autorizado. Si el usuario autorizo `~/proj/sub` pero el repo arranca en `~/proj`, Kex auto-autoriza `~/proj` entero (status/diff/log de todo el padre).

## Impacto / repro
Escalada de alcance sutil; viola "autorizacion nunca evadible". Repro: autorizar un subdirectorio `~/proj/sub` que pertenece a un repo cuyo toplevel es `~/proj`; ejecutar una operacion git y observar que `~/proj` queda autorizado por completo, exponiendo status/diff/log del padre.

## Fix
Antes de `registry.authorize(canonical_root)`, exigir la relacion ancestro/descendiente esperada o documentar y confirmar explicitamente la politica. No extender el alcance hacia arriba sin confirmacion del usuario.

## Criterios de aceptacion
- La auto-autorizacion del repo root no extiende el alcance hacia un ancestro de un root ya autorizado sin confirmacion.
- Si el toplevel del repo queda fuera de cualquier root autorizado, la operacion falla o solicita autorizacion explicita, en lugar de auto-autorizar silenciosamente el padre.
- La politica adoptada queda documentada.

## Verificacion
Rust: `cd src-tauri && cargo clippy && cargo test --locked`.

## Test a anadir
Subsistema core (workspace auth / git). Anadir test que fije el invariante: dado un root autorizado `~/proj/sub` y un repo con toplevel `~/proj`, la resolucion no auto-autoriza `~/proj`. Verificar el caso valido (toplevel dentro o igual al root autorizado) y el caso invalido (toplevel ancestro del root autorizado) por separado.
