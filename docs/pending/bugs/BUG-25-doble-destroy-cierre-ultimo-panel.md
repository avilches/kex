# BUG-25 [low] Doble destroy() en carrera al cerrar el ultimo panel + boton rojo simultaneo

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/main.tsx:65-75`
`src/modules/workspaces/lib/useWorkspaces.ts:66-70`

## Problema
Ambos paths llaman a `flushWorkspaceState()` + `destroy()`. Al cerrar el ultimo panel y pulsar el boton rojo de la ventana de forma simultanea, ambos paths corren en carrera, produciendo flush e IPC de destroy redundantes.

## Impacto / repro
Caso de borde benigno: doble IPC de flush y de destroy en la carrera. No corrompe estado, pero es trabajo redundante.

Repro: cerrar el ultimo panel y pulsar el boton de cerrar ventana casi a la vez. Observar dos invocaciones de `flushWorkspaceState`/`destroy`.

## Fix
Guard de modulo compartido entre ambos paths: `let destroying = false;`. El primero que entra lo pone a `true`; el segundo path comprueba el flag y aborta su `flush`/`destroy` si ya esta en curso.

## Criterios de aceptacion
- Cuando ambos paths se disparan en carrera, `flushWorkspaceState` y `destroy` se ejecutan una sola vez.
- El cierre sigue persistiendo el estado correctamente en el caso normal (un solo path).

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Verificar que disparar ambos paths no produce doble flush/destroy.

## Test a anadir
No aplica directamente (coordinacion entre `main.tsx` y el hook, dificil de aislar). Si se factoriza el guard a un modulo, anadir un test que verifique que la segunda llamada es no-op cuando `destroying` ya es `true`.
