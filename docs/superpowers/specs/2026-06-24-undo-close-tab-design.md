# Design: Reabrir tab cerrado (F5)

**Fecha:** 2026-06-24
**Shortcut:** Cmd+Shift+T (Ctrl+Shift+T en Linux/Windows)

## Objetivo

Reabrir el ultimo panel cerrado en el mismo pane donde estaba, restaurando su tipo y contexto. Si el pane original ya no existe, reabrir en el pane activo del workspace original. Si el workspace tampoco existe, reabrir en el workspace activo.

## Cambio de shortcut existente

`tab.newBlock` se mueve de `Cmd+Shift+T` a `Cmd+B` para liberar el binding estandar de navegadores y editores.

## Datos

```ts
// En useWorkspaces, fuera del estado React (no causa re-renders, no persiste)
type ClosedEntry = { panel: Panel; paneId: string; workspaceId: string };
closedPanelsRef = useRef<ClosedEntry[]>([])  // LIFO, cap 10
```

El campo `panel` almacena el objeto Panel completo tal como estaba en el momento del cierre. Al reabrirlo se le asigna un `id` nuevo para que el sistema cree una instancia nueva (terminal, editor, etc.).

## Flujo de captura

En `closePanel` (callback de `useWorkspaces`), antes del `setWorkspaces`:

1. Leer `workspacesRef.current` para encontrar el workspace y el panel por su ID.
2. Si se encuentra, hacer push al inicio de `closedPanelsRef.current` con `{ panel, paneId, workspaceId }`.
3. Truncar el array a 10 entradas.

No se capturan cierres de workspace entero, solo cierres de panel individuales.

## Flujo de reapertura (`reopenClosed`)

1. Pop del primer elemento de `closedPanelsRef.current`. Si esta vacio, no-op.
2. Buscar el workspace original en `workspacesRef.current`. Si no existe, usar el workspace activo.
3. Buscar el pane original (`paneId`) en el arbol del workspace. Si no existe, usar `ws.activePaneId`.
4. Crear `newPanel = { ...entry.panel, id: newPanelId() }`.
5. Llamar `openPanel(workspaceId, targetPaneId, newPanel)`.

## Shortcuts

| ID | Binding | Label |
|----|---------|-------|
| `tab.newBlock` | `Cmd+B` / `Ctrl+B` | New Blocks Terminal *(cambiado)* |
| `tab.reopenClosed` | `Cmd+Shift+T` / `Ctrl+Shift+T` | Reopen Closed Tab *(nuevo)* |

El nuevo shortcut se registra en `shortcuts.ts` siguiendo el patron existente. El handler en `App.tsx` llama a `reopenClosed` del workspace activo.

## Tests

- Push/pop correcto (LIFO).
- Cap de 10: la entrada 11 descarta la mas antigua.
- Fallback pane inexistente: reopens en pane activo.
- Fallback workspace inexistente: reopens en workspace activo.
- Panel reabierto lleva ID nuevo.

## Archivos a tocar

| Archivo | Cambio |
|---------|--------|
| `src/modules/shortcuts/shortcuts.ts` | Anadir `tab.reopenClosed` al union type y al array; mover binding de `tab.newBlock` a `Cmd+B` |
| `src/modules/workspaces/lib/types.ts` | Anadir tipo `ClosedEntry` |
| `src/modules/workspaces/lib/useWorkspaces.ts` | `closedPanelsRef`, captura en `closePanel`, nueva funcion `reopenClosed`, exponerla en el return |
| `src/app/App.tsx` | Handler `"tab.reopenClosed"` en `shortcutHandlers` |
| `src/modules/workspaces/lib/useWorkspaces.test.ts` | Tests de la logica de captura y reopen |
