# Design: Historico MRU de tabs por pane

**Fecha:** 2026-06-26

## Objetivo

Cuando se cierra el tab activo de un pane, el foco debe volver al tab usado mas
recientemente (most-recently-used) que siga existiendo en ese pane, no al tab
adyacente. Encadenar cierres recorre el historial hacia atras: abres A, B, C
(activo C); cierras C vuelves a B; cierras B vuelves a A.

El historial es en memoria, nunca se persiste, y es por pane (cada split mantiene
el suyo, el foco nunca salta a otro pane).

## No confundir con el undo de cerrar tab

Este sistema es independiente de `closedPanelsRef` / `reopenClosed`
(ver `2026-06-24-undo-close-tab-design.md`). Son opuestos:

- **Undo (existe):** guarda el `Panel` de tabs *muertos* para resucitarlos. Al
  cerrar, el id *entra*.
- **MRU (este spec):** guarda `panelId` de tabs *vivos* para elegir el foco. Al
  cerrar, el id *sale*.

Solo comparten el punto de entrada (`closePanel`) y la filosofia (ref en memoria,
no persistido). No se fusionan.

## Datos

```ts
// En useWorkspaces, fuera del estado React (no causa re-renders, no persiste)
const MRU_HISTORY_LIMIT = 50;
// paneId -> panelIds ordenados de mas reciente a mas antiguo
const paneActivationHistoryRef = useRef<Map<string, string[]>>(new Map());
```

Solo se guardan strings (`panelId`). El cap de 50 es una salvaguarda defensiva:
como la lista se purga a tabs vivos del pane, su tamano natural es el numero de
tabs abiertos. No hay limite de tabs por pane (solo de panes via
`workspacePaneLimit`), asi que 50 cubre cualquier caso real.

## Registro de activacion

Helper puro reutilizable:

```ts
function pushMru(history: string[], panelId: string, limit = MRU_HISTORY_LIMIT): string[] {
  return [panelId, ...history.filter((id) => id !== panelId)].slice(0, limit);
}
```

Un metodo interno `recordActivation(paneId, panelId)` actualiza el Map con
`pushMru`. Se invoca en los tres unicos puntos donde `activePanelId` pasa a
apuntar a un panel real:

- `activatePanel` (click en tab, atajos de navegacion entre tabs)
- `openPanel` (nuevo terminal/browser/editor/markdown/etc.)
- `replacePanel` (preview de editor que se reemplaza por otro)

`activatePanel` ya calcula el pane via `findPanelPane`; los otros dos reciben el
`paneId` directamente.

## Logica de cierre

`applyClosePanel` recibe un parametro nuevo opcional:

```ts
export function applyClosePanel(
  workspaces: Workspace[],
  workspaceId: string,
  panelId: string,
  history?: string[],   // MRU del pane que contiene panelId, mas reciente primero
): Workspace[]
```

Cuando se cierra el tab activo de un pane con mas de un tab, el nuevo activo se
calcula asi:

1. Recorrer `history` y tomar el primer id que cumpla `id !== panelId` y que
   exista en `remaining`. Ese es el nuevo activo.
2. Si no hay ninguno (historial vacio, o todos sus tabs ya cerrados), caer al
   comportamiento actual: `(remaining[idx] ?? remaining[idx - 1])?.id ?? null`.

El parametro es opcional, asi que sin historial el comportamiento es identico al
de hoy. Los tests actuales de `applyClosePanel` siguen pasando sin tocarlos.

El callback `closePanel` de `useWorkspaces` lee la lista MRU del pane que contiene
el tab y la pasa a `applyClosePanel`.

## Limpieza

- **Al cerrar un tab:** se elimina su `panelId` del historial de su pane. Si el
  pane desaparece (se cerro su ultimo tab), se borra la entrada del Map.
- **Tabs movidos entre panes (drag):** no necesita manejo explicito. El id que
  quedo en el historial del pane viejo ya no esta en su `remaining`, asi que el
  filtro del paso 1 lo ignora. Se documenta este detalle en el codigo.

El filtrado por pertenencia real al pane (`remaining`) hace que cualquier entrada
stale sea inocua: nunca se selecciona un id que no exista.

## Recursos al cerrar (contexto, no cambia)

Cerrar un tab libera sus recursos, independientemente del MRU (que solo guarda
ids de tabs vivos):

- Terminal: `App.tsx` reconcilia `livePanelIdsRef` con el arbol y llama
  `disposeSession(id)`, que mata el PTY via `pty_close`.
- Browser / markdown / editor: el componente se desmonta (sale del arbol), no se
  refresca nada; sus handles se limpian.

El MRU no mantiene vivo ningun recurso.

## Tests

En `useWorkspaces.test.ts`, sobre `applyClosePanel` con `history`:

- Cerrar el activo vuelve al MRU anterior existente (no al adyacente).
- Salta entradas del historial cuyos tabs ya no existen.
- Cae al adyacente cuando el historial esta vacio (comportamiento legacy intacto).
- Cadena C -> B -> A respeta el orden MRU.
- Cerrar un tab no-activo no cambia el activo.

Sobre `pushMru` (helper puro):

- Mueve al frente un id ya presente sin duplicar.
- Respeta el cap (entrada que excede el limite descarta la mas antigua).

## Archivos a tocar

| Archivo | Cambio |
|---------|--------|
| `src/modules/workspaces/lib/useWorkspaces.ts` | `MRU_HISTORY_LIMIT`, `pushMru`, `paneActivationHistoryRef`, `recordActivation`; llamarlo en `activatePanel`/`openPanel`/`replacePanel`; pasar y purgar historial en `closePanel`; nuevo parametro `history` en `applyClosePanel` |
| `src/modules/workspaces/lib/useWorkspaces.test.ts` | Tests de `applyClosePanel` con historial y de `pushMru` |

Sin cambios en persistencia, en el modelo `Workspace`/`Panel`, ni en la UI.
