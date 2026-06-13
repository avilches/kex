# M1 - Memoización del árbol de workspaces y estado efímero fuera del árbol persistido

**Esfuerzo: medio. Impacto: alto** (la mejora de rendimiento de mayor impacto dado el modelo "nunca desmontar").

## Problema

El modelo de render es un árbol recursivo `WorkspaceView → SplitNodeView → PaneView → PanelContent` que nunca se desmonta. Hoy cualquier cambio de `workspaces` re-renderiza el árbol completo de **todos** los workspaces, no solo el pane afectado. Tres causas verificadas:

- **BUG-10:** `setTerminalPanelCwd` (cada `cd`, OSC 7) y `setTerminalRunningCommand` (cada comando, OSC 133 C/D) mutan el árbol `workspaces`, disparando el effect de persistencia (`App.tsx:152`) que hace copia profunda + IPC en cada flush.
- **BUG-09:** `WorkspaceDndProvider` (`:306`) crea un value de contexto nuevo cada render → cascada en drag.
- Falta `React.memo` en `PaneView`/`SplitNodeView`, y callbacks no memoizados que lo anularían.

## Objetivo

Que un cambio en un panel re-renderice solo su subárbol, y que el estado efímero (cwd mostrada, comando en ejecución) no mute la identidad del árbol persistido.

## Plan accionable

1. **Sacar estado efímero del árbol persistido (BUG-10):** mover `runningCommand` (y evaluar `cwd` de presentación) a un store separado `Map<panelId, …>` con `useSyncExternalStore`, de modo que `cd`/comandos no produzcan un `workspaces` nuevo. Si `cwd` debe persistirse para restaurar terminales, persistirla con su propio debounce sin tocar la identidad del árbol en cada cambio.
2. **Memoizar `value` del DnD (BUG-09):** `useMemo(() => ({ draggingItem, tabInsertPaneId }), [...])`; considerar separar `tabInsertPaneId` en su propio contexto para que consumidores de `draggingItem` no re-rendericen.
3. **`React.memo` en `PaneView` y `SplitNodeView`** con comparación por `pane`/`node` (referencia estable gracias a la inmutabilidad de `splitNode.ts`, que ya devuelve la misma referencia sin cambio).
4. **Estabilizar callbacks** pasados por `{...rest}` desde `App.tsx`/`WorkspaceView.tsx` (`onActivatePanel`, `onClosePanel`, etc.) con `useCallback`; un callback inestable anula el `memo`.
5. **Cachear `allPanes(tree)` durante el drag** (`WorkspaceDndProvider.tsx`): hoy se recorre varias veces por evento `dragover`; precomputar un índice `panelId→{paneId,index}` en `dragStart`.
6. **Quitar debug de producción (BUG-22, BUG-23):** `DEBUG_PANE_SIZE` y la suscripción `useSyncExternalStore` por pane tras `import.meta.env.DEV`; eliminar `console.log` de `workspaceState.ts`.

## Criterios de aceptación

- Ejecutar comandos en un terminal no re-renderiza los panes de otros workspaces (verificable con React DevTools Profiler).
- Un `cd` no dispara la copia profunda + IPC de persistencia del árbol completo.
- Arrastrar un tab no re-renderiza el árbol entero en cada `dragover`.
- Sin overlay de debug ni logs en build de producción.
- Tests existentes en verde.

## Relacionado

- BUG-09, BUG-10, BUG-22, BUG-23.
- Habilita que F6 (scrollback) no agrave la persistencia.
