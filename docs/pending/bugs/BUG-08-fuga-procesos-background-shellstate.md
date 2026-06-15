# BUG-08 [medium · memoria] Fuga: los procesos background nunca se eliminan del mapa ShellState.bg

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src-tauri/src/modules/shell/mod.rs:233-271` (shell_bg_spawn, shell_bg_kill), `src-tauri/src/modules/shell/background.rs:14` (RING_CAP = 4 MiB).

## Problema
`shell_bg_spawn` hace `insert(id, proc)` pero no hay ningun `remove`. `shell_bg_kill` solo hace `get().cloned()` y mata el hijo, dejando el `Arc<BackgroundProc>` (con su ring buffer de hasta 4 MiB) en el mapa para siempre. Tampoco hay reaping de procesos que terminan solos.

## Impacto / repro
Arrancar y matar N dev-servers deja N buffers residentes de hasta 4 MiB cada uno. Contradice "ultraligero / cada feature no usada consume cero recursos". Repro: lanzar varios procesos background con `shell_bg_spawn`, matarlos con `shell_bg_kill`, observar que el mapa `ShellState.bg` sigue conteniendo las entradas y la RAM no se libera.

## Fix
Anadir `shell_bg_remove(handle)` y que `shell_bg_kill` elimine la entrada del mapa tras matar el hijo. Reapear entradas en estado exited en `shell_bg_list`/`shell_bg_logs` con un TTL. Spec ampliada en `docs/pending/improvements/M6-reaping-bg-procs-y-registry.md`.

## Criterios de aceptacion
- Tras `shell_bg_kill`, la entrada correspondiente desaparece del mapa `ShellState.bg` y su ring buffer se libera.
- Existe un mecanismo (`shell_bg_remove` o reaping con TTL) para purgar procesos que terminan solos.
- El mapa `ShellState.bg` no crece sin cota ante ciclos repetidos de spawn/kill.

## Verificacion
Rust: `cd src-tauri && cargo clippy && cargo test --locked`.

## Test a anadir
Subsistema core (shell/IPC). Anadir test que verifique que el mapa `ShellState.bg` no crece sin cota: tras N ciclos de spawn + kill, el numero de entradas en el mapa vuelve a su valor base (idealmente 0). Verificar tambien que el reaping elimina entradas exited tras superar el TTL.
