# BUG-23 [low] console.log en el camino de persistencia (cada flush) y en init, en produccion

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/workspaces/lib/workspaceState.ts:31`, `:33`, `:64`, `:82`

## Problema
Hay `console.log` no condicionados a DEV en el camino de persistencia (cada flush) y en init. Generan ruido en consola, un coste menor por cada flush, y revelan labels de ventana en builds de produccion.

## Impacto / repro
Ruido en la consola de produccion, coste menor en el hot path de persistencia (debounced 300ms en cada cambio de estado de workspace), y filtracion de labels de ventana.

Repro: usar la app en build de produccion y observar `console.log` de persistencia/init en la consola del webview.

## Fix
Envolver cada `console.log` en `import.meta.env.DEV` o eliminarlos. El camino de persistencia no debe loguear en release.

## Criterios de aceptacion
- En build de produccion no se emiten estos `console.log` en el flush ni en init.
- En dev pueden conservarse si son utiles para diagnostico (bajo el guard).

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Verificar con build de produccion que el flush de `workspaceState` no emite logs.

## Test a anadir
No aplica (limpieza de logging). Verificacion manual con build de produccion.
