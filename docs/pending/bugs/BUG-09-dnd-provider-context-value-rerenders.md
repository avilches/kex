# BUG-09 [medium · perf] WorkspaceDndProvider crea un value de contexto nuevo en cada render, cascada de re-renders en drag

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/workspaces/WorkspaceDndProvider.tsx:306`

## Problema
`value={{ draggingItem, tabInsertPaneId }}` es un literal nuevo en cada render. Durante un drag, `handleDragOver` llama a `setTabInsertPaneId` muy frecuentemente; cada cambio re-renderiza el provider con una referencia nueva, y todos los consumidores de `useWorkspaceDnd` (cada `WorkspaceView` -> arbol completo `SplitNodeView` -> `PaneView`) re-renderizan aunque su slice no cambie.

## Impacto / repro
Mover el puntero durante un drag dispara un re-render del arbol entero en cada `dragover`. Trabajo desperdiciado en un hot path. Repro: iniciar un drag de tab y mover el puntero por la UI; perfilar con React DevTools y observar que el arbol completo de paneles se vuelve a renderizar en cada evento.

## Fix
```ts
const ctxValue = useMemo(() => ({ draggingItem, tabInsertPaneId }), [draggingItem, tabInsertPaneId]);
```
y pasar `value={ctxValue}`. Considerar ademas separar `tabInsertPaneId` en su propio contexto para que sus cambios frecuentes no invaliden a los consumidores de `draggingItem`. Spec relacionada en `review/improvements/M1-memoizacion-arbol-workspaces.md`.

## Criterios de aceptacion
- El value del contexto se memoiza con `useMemo` y solo cambia de referencia cuando cambian `draggingItem` o `tabInsertPaneId`.
- Durante un drag, los consumidores cuyo slice no cambia no re-renderizan.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`.

## Test a anadir
No aplica (no es subsistema core de terminal/shell spawn, workspace auth, git, fs o IPC). Validacion manual con React DevTools Profiler para confirmar la reduccion de re-renders durante el drag.
