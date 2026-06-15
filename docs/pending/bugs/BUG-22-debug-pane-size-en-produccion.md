# BUG-22 [low] Codigo de debug activo en produccion: badge de tamano de pane + suscripcion al pool por pane

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/workspaces/PaneView.tsx:100` (`const DEBUG_PANE_SIZE = true; // TODO: remove`), `:104-107`, `:141-151`
`docs/WORKSPACES_GPU.md:91` (ya marcado como "remove before ship")

## Problema
`DEBUG_PANE_SIZE` esta hardcodeado a `true`. Cada `PaneView` se suscribe al pool via `useSyncExternalStore` solo para alimentar el ring del badge de debug; `notifyPool()` re-renderiza los N panes. El overlay de tamano de pane es visible y no deberia estar en release.

## Impacto / repro
Overhead de re-render por cada evento del pool, multiplicado por el numero de panes, mas un overlay de debug visible en builds de produccion. Contrario a la filosofia ultraligera.

Repro: abrir un workspace con varios panes en build de produccion. Observar el badge de tamano de pane y, en el profiler, re-renders de todos los panes ante eventos del pool.

## Fix
Poner `DEBUG_PANE_SIZE` tras `import.meta.env.DEV` (o eliminarlo) y mover la suscripcion `useSyncExternalStore`/`activeIsGpu` dentro del guard de DEV, o eliminarla por completo. El badge y la suscripcion no deben ejecutarse en release.

## Criterios de aceptacion
- En build de produccion no se renderiza el badge de tamano de pane.
- En produccion los `PaneView` no se suscriben al pool solo por el badge; `notifyPool()` no provoca re-render de todos los panes por ese motivo.
- En dev el badge sigue disponible si se desea para diagnostico.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Verificar con un build de produccion (`import.meta.env.DEV === false`) que el overlay no aparece y que no hay suscripcion al pool desde `PaneView` por el badge. Actualizar `docs/WORKSPACES_GPU.md:91` si procede.

## Test a anadir
No aplica (codigo de debug a eliminar/condicionar). Verificacion manual con build de produccion.
