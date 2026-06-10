# Workspace Focus Restore + Tab Focus Indicator

## Objetivo

Dos mejoras de UX relacionadas con el foco en workspaces y tabs:

1. Al cambiar de workspace activo (por cierre o por navegación), restaurar el foco en el terminal activo del nuevo workspace.
2. Añadir una línea azul de 2px en la parte superior del tab que tiene el foco global, distinguiéndolo de los tabs que meramente están "activos" en su pane sin tener el foco.

---

## Feature 1: Foco automático al cambiar workspace

### Contexto

Cuando el usuario cierra un workspace o navega entre workspaces con el atajo de teclado o el sidebar, el workspace anterior queda en pantalla sin foco en ningún terminal. El usuario tiene que hacer click manualmente para reactivar el terminal.

### Diseño

Añadir un `useEffect` en `src/app/App.tsx` con dependencia `[activeWorkspaceId]`:

```ts
useEffect(() => {
  const ws = workspacesRef.current.find(w => w.id === activeWorkspaceId);
  if (!ws) return;
  const pane = findPane(ws.paneTree, ws.activePaneId);
  if (!pane?.activePanelId) return;
  const raf = requestAnimationFrame(() => {
    terminalHandles.current.get(pane.activePanelId!)?.focus();
  });
  return () => cancelAnimationFrame(raf);
}, [activeWorkspaceId]);
```

- Usa `workspacesRef` (no `workspaces`) para evitar capturar un closure stale.
- El `requestAnimationFrame` asegura que el DOM del nuevo workspace ya es visible antes de llamar a `focus()`.
- Solo intenta focus en terminales (vía `terminalHandles`). Si el panel activo es un editor u otro tipo, simplemente no ocurre nada.

### Ficheros afectados

- `src/app/App.tsx`: nuevo `useEffect`

---

## Feature 2: Indicador visual del tab con foco global

### Contexto

Con múltiples panes abiertos, cada pane muestra su tab activo con fondo `bg-muted`. Sin embargo, no está claro cuál de todos los tabs tiene el foco real (el que recibe el input del teclado). El usuario pide una línea azul de 2px en la parte superior del tab con foco global.

### Semántica

- **Tab activo por pane:** el que tiene `activePanelId` en ese pane. Estilo actual: `bg-muted`. Se mantiene igual.
- **Tab con foco global:** el tab activo del pane activo del workspace activo. Añade línea azul de 2px arriba.

Solo puede haber una línea azul en pantalla a la vez.

### Diseño

**`src/modules/workspaces/PaneTabBar.tsx`**

- Añadir prop `paneFocused: boolean` al componente `PaneTabBar` y a `DraggableTab`.
- Añadir `relative` al className del tab (necesario para el elemento absoluto).
- Cuando `active && paneFocused`, renderizar dentro del tab:
  ```tsx
  <div className="absolute inset-x-0 top-0 h-0.5 rounded-t bg-primary" />
  ```

**`src/modules/workspaces/PaneView.tsx`**

- Pasar `paneFocused={focused}` a `<PaneTabBar>`. El prop `focused` ya existe y es `pane.id === ws.activePaneId`.

### Ficheros afectados

- `src/modules/workspaces/PaneTabBar.tsx`: prop `paneFocused`, indicador visual
- `src/modules/workspaces/PaneView.tsx`: pasar `paneFocused={focused}`

---

## Ficheros en scope

| Fichero | Cambio |
|---|---|
| `src/app/App.tsx` | Nuevo `useEffect` para focus en workspace switch |
| `src/modules/workspaces/PaneTabBar.tsx` | Prop `paneFocused`, línea azul en tab activo |
| `src/modules/workspaces/PaneView.tsx` | Pasar `paneFocused={focused}` a PaneTabBar |

## Ficheros fuera de scope

- Theme / CSS global: no se modifica
- `useWorkspaces.ts`, `workspaceState.ts`: no se modifica
- `WorkspaceView.tsx`, `SplitNodeView.tsx`: no se modifica
