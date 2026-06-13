# BUG-20 [low] pty_open autoriza la cwd permanentemente aunque el spawn falle despues

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src-tauri/src/modules/pty/mod.rs:58-76`

## Problema
`authorize_user_spawn_cwd` registra la cwd en el registry de autorizacion antes de llamar a `session::spawn`. Si el spawn falla, la cwd queda autorizada para git/watch sin que exista ninguna terminal abierta para ella.

## Impacto / repro
Bajo. Una ruta cuyo spawn falla queda autorizada de forma permanente, ampliando la superficie de autorizacion sin terminal asociada.

Repro: invocar `pty_open` con una cwd para la que el spawn falla (ej. directorio inexistente o shell no ejecutable). Verificar que la cwd queda en el registry y permite operaciones git/watch posteriores.

## Fix
Autorizar la cwd solo despues de un spawn exitoso, o desautorizarla en el path de error del spawn. Preferible mover `authorize_user_spawn_cwd` despues de que `session::spawn` retorne Ok, o anadir cleanup en el `Err`.

## Criterios de aceptacion
- Si `session::spawn` falla, la cwd no queda autorizada en el registry.
- Si el spawn tiene exito, la cwd queda autorizada como hasta ahora.

## Verificacion
Rust: `cd src-tauri && cargo clippy && cargo test --locked`. Verificar que un spawn fallido no deja la cwd autorizada.

## Test a anadir
Subsistema core (terminal/shell spawn + workspace auth). Anadir un test Rust que simule un spawn fallido y verifique que la cwd no queda en el registry de autorizacion; y uno con spawn exitoso que verifique que si queda autorizada.
