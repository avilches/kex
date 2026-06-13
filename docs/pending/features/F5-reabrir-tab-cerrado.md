# F5 - Reabrir panel/tab cerrado (Cmd+Shift+T)

**Prioridad: media.** Patrón estándar de terminales y editores, peso despreciable, totalmente alineado con la filosofía (terminales + ficheros, sin agentes).

## Objetivo

`Cmd+Shift+T` (Ctrl+Shift+T en Linux/Windows) reabre el último panel cerrado en el mismo pane donde estaba, restaurando su tipo y contexto:

- Terminal: reabrir con la misma `cwd`.
- Editor: reabrir el mismo fichero (en su última posición de scroll si es barato).
- Diff / markdown / preview: reabrir con el mismo `source`.

## Diseño técnico

- Pila acotada (p.ej. 10 entradas) de paneles cerrados recientemente en el store de workspaces (`useWorkspaces`), guardando lo mínimo para reconstruir: `{ kind, cwd|path|source, paneId }`.
- Al cerrar un panel (`closePanel` en `splitNode.ts`/`useWorkspaces`), push a la pila.
- Handler `tab.reopenClosed` que hace pop y reinserta el panel en el pane original (si el pane ya no existe, en el pane activo).
- Registrar el atajo en `shortcuts.ts` y cablear el handler en `App.tsx` por id (patrón existente).
- No persistir la pila entre sesiones (estado efímero), para no inflar `workspaces.json`.

## Plan accionable

1. Añadir `recentlyClosed: ClosedPanel[]` al estado de `useWorkspaces` (fuera del árbol persistido).
2. En `closePanel`, capturar la entrada mínima y hacer push (cap 10).
3. Implementar `reopenClosed()`: pop + reinserción en el pane original/activo, reusando `openPanel`/`splitPaneAndOpenFile`.
4. Registrar `tab.reopenClosed` en `shortcuts.ts` (`Cmd/Ctrl+Shift+T`) y handler en `App.tsx`.
5. Tests de la lógica pura (push/pop, cap, pane inexistente → pane activo).

## Criterios de aceptación

- Cerrar un terminal con cwd `~/proj` y `Cmd+Shift+T` lo reabre en el mismo pane con esa cwd.
- Cerrar un editor y reabrirlo restaura el fichero.
- La pila respeta el cap y no persiste entre reinicios.

## Relacionado

- Pequeña; buena candidata de "quick win" de alto valor percibido.
