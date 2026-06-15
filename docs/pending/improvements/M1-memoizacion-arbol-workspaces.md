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

1. ~~**Sacar estado efímero del árbol persistido (BUG-10)**~~ **HECHO** — `runningCommand` movido a `terminalEphemeralStore.ts` (`Map<panelId, string>` con `useSyncExternalStore`). `setTerminalRunningCommand` ya no llama a `setWorkspaces`; `PaneTabBar` suscribe al store. `cwd` sigue en el árbol (necesario para restore de sesión).
2. ~~**Memoizar `value` del DnD (BUG-09)**~~ **HECHO** — `useMemo(() => ({ draggingItem, tabInsertPaneId }), [...])` en `WorkspaceDndProvider.tsx`.
3. **`React.memo` en `PaneView` y `SplitNodeView`** con comparación por `pane`/`node` — requiere BUG-10 previo (callbacks que cierran sobre `workspaces` se recrean en cada `cd`) y sacar `tabInsertPaneId` del prop chain (ver nota más abajo).
4. **Estabilizar callbacks** pasados desde `App.tsx` con `useCallback` — depende también de BUG-10 para ser efectivo.
5. ~~**Cachear `allPanes(tree)` durante el drag**~~ **HECHO** — índice `panelId→{paneId,wsId}` construido en `dragStart`, usado en `handleDragOver` y `handleDragEnd` (`WorkspaceDndProvider.tsx`).
6. ~~**Quitar debug de producción (BUG-22, BUG-23)**~~ **HECHO** — overlay eliminado, `console.debug` guardados tras `import.meta.env.DEV`.

### Nota sobre items 3-4 (React.memo + callbacks)

`tabInsertPaneId` se propaga como prop por toda la cadena `WorkspaceView → SplitNodeView → PaneView`. Con ese prop drilling, `React.memo` no puede saltarse el re-render durante drag (el prop cambia en cada `dragover`). Para que memo sea efectivo durante DnD, hace falta sacar `tabInsertPaneId` del prop chain y que `PaneView` lo lea desde un contexto separado en un sub-componente de DropZone. Hacer esto primero — y BUG-10 para el caso de `cd`/comandos.

## Criterios de aceptación

- Ejecutar comandos en un terminal no re-renderiza los panes de otros workspaces (verificable con React DevTools Profiler).
- Un `cd` no dispara la copia profunda + IPC de persistencia del árbol completo.
- Arrastrar un tab no re-renderiza el árbol entero en cada `dragover`.
- Sin overlay de debug ni logs en build de producción.
- Tests existentes en verde.

## Relacionado

- BUG-09, BUG-10, BUG-22, BUG-23.
- Habilita que F6 (scrollback) no agrave la persistencia.
