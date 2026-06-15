# BUG-17 [medium · perf] La busqueda IPC no se cancela: traversals de ripgrep superados corren hasta el final

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/command-palette/hooks/useAsyncQuery.ts:32-50`
`src/modules/command-palette/hooks/useContentSearch.ts:31-38`

## Problema
Al cambiar el termino de busqueda, el lado JS descarta el resultado viejo por request-id, pero el `invoke("fs_grep_interactive", ...)` subyacente nunca se cancela. Cada keystroke pasado el debounce arranca un traversal completo del workspace. El Rust ya tiene un generation counter, pero no se le notifica la cancelacion desde el front, asi que los scans superados corren hasta su limite de hits.

## Impacto / repro
Teclear rapido en un repo grande dispara varios scans solapados, cada uno hasta su limite de hits. Coste de bateria y CPU innecesario, contrario a la filosofia ultraligera.

Repro: abrir la command palette / busqueda de contenido en un repo grande, teclear un termino largo rapido. Observar varios traversals de ripgrep corriendo en paralelo hasta completar, aunque solo el ultimo importa.

## Fix
Pasar un `AbortSignal` a traves de `run(term, signal)` y, en el cleanup del effect, invocar el path de cancelacion de Rust (notificar al generation counter / comando de cancelacion) para abortar el traversal en vuelo. Ver spec ampliada en `docs/pending/improvements/M4-cancelacion-busqueda-ipc.md`.

## Criterios de aceptacion
- Cambiar el termino de busqueda cancela el traversal anterior antes (o al inicio) de lanzar el nuevo.
- En un repo grande, teclear rapido no deja multiples scans completos corriendo en paralelo.
- El resultado mostrado corresponde siempre al ultimo termino.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Rust: `cd src-tauri && cargo clippy && cargo test --locked`. Verificar que un cambio de termino notifica la cancelacion al backend y que el scan previo se aborta (medir CPU o anadir logging temporal del generation counter).

## Test a anadir
Subsistema core (fs::grep / busqueda IPC). Anadir un test Rust que verifique que el comando de cancelacion / bump del generation counter detiene un traversal en curso, y un test front que verifique que el cleanup de `useAsyncQuery`/`useContentSearch` invoca el path de cancelacion.
