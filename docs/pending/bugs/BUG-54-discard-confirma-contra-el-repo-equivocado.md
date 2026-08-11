---
id: BUG-54
title: El descarte de cambios confirma contra el repo activo en ese instante, no contra el que se pidio (perdida irrecuperable de cambios sin commitear)
area: source-control / workspaces / shortcuts
severity: high
status: confirmado por lectura de codigo, sin reproducir en la app
---

## Descripcion

`src/modules/source-control/useSourceControlPanel.ts` guarda el descarte pendiente como rutas
**relativas al repo** y resuelve el `repoRoot` **en el momento de confirmar**, no en el momento de
pedirlo. Si el repo activo cambia mientras el dialogo de confirmacion esta abierto, el descarte se
aplica al repo nuevo usando las rutas del repo viejo.

El estado pendiente (`useSourceControlPanel.ts:355`) guarda entradas de
`SourceControlEntry`, cuyo campo `path` es relativo al repo:

```ts
const [pendingDiscard, setPendingDiscard] = useState<...>(null);
```

Y `executeDiscard` (`useSourceControlPanel.ts:723-739`) lee `repo.repoRoot` del estado vivo:

```ts
const executeDiscard = useCallback(
  async (list: SourceControlEntry[], key: string) => {
    if (!repo) return;
    const entries: GitDiscardEntry[] = list.map((entry) => ({
      path: entry.path,          // <-- relativo, capturado al PEDIR
      untracked: entry.untracked,
    }));
    const paths = new Set(list.map((entry) => entry.path));
    await runMutation(
      key,
      (s) => optimisticDiscard(s, paths),
      () => native.gitDiscard(repo.repoRoot, entries),   // <-- root leido al CONFIRMAR
      [...paths],
    );
  },
  [repo, runMutation],
);
```

`git_discard` ejecuta un `git restore`, que destruye cambios sin commitear. No hay papelera ni reflog
que los recupere: es perdida de datos definitiva.

## Por que es alcanzable

Son cuatro hechos que se combinan. Los cuatro verificados leyendo el codigo:

1. **Nadie limpia `pendingDiscard` al cambiar de repo.** Los unicos `setPendingDiscard(null)` estan en
   `cancelPendingDiscard` (`:759-761`) y en `confirmPendingDiscard` (`:773`). El efecto que reacciona al
   cambio de contexto (`:564-598`) limpia `repo`, `status`, `selected`, `panelState` y
   `selectionTransition`, pero **no** `pendingDiscard`.

2. **La vista que alimenta el dialogo no valida nada.** `pendingDiscardView`
   (`useSourceControlPanel.ts:898-917`) es una derivacion puramente de formato: cuenta entradas y compone
   la etiqueta. No comprueba que las entradas sigan existiendo en el `status` actual ni que el repo sea el
   mismo. Solo devuelve `null` si `pendingDiscard` es `null`. Es lo que se expone como
   `pendingDiscard: pendingDiscardView` (`:941`), asi que el dialogo **sigue abierto** tras el cambio de
   workspace, mostrando el texto del repo viejo.

3. **`confirmPendingDiscard` no tiene ninguna guardia.** Compararlo con sus hermanos: seis callbacks del
   mismo fichero comprueban `summary.isSwitchingContext` antes de actuar (`:468`, `:491`, `:511`, `:672`,
   `:836`, `:873`). Los tres que piden un descarte comprueban solo `summary.busyAction`, sin
   `isSwitchingContext`: `requestDiscardEntry` (`:741-752`), `requestDiscardAll` (`:754-757`) y
   `requestDiscardEntries` (`:827-833`). Y `confirmPendingDiscard` (`:763-775`) no comprueba nada de nada.
   El boton tampoco: `SourceControlPanel.tsx` alrededor de la linea 1302 es
   `<AlertDialogAction onClick={() => void scm.confirmPendingDiscard()}>` sin `disabled`.

4. **El atajo de cambio de workspace se dispara con el modal abierto.**
   `src/modules/shortcuts/lib/useGlobalShortcuts.ts:42` registra
   `window.addEventListener("keydown", onKey, { capture: true })`. En fase de captura y sobre `window`, sin
   ninguna comprobacion de dialogo abierto: no mira `role="dialog"`, ni `aria-modal`, ni hace `closest()`
   sobre el target. El unico freno es el `options.isDisabled` por atajo, que se usa de forma contextual
   para casos concretos (el rename del explorer) y no cubre esto. Los atajos implicados son
   `workspace.prev` (Mod+Alt+Flecha arriba) y `workspace.next` (Mod+Alt+Flecha abajo),
   `src/modules/shortcuts/shortcuts.ts:135-145`.

## Reproduccion (a confirmar en la app)

1. Tener dos workspaces, A y B, apuntando a **repos git distintos**, y en ambos un fichero modificado sin
   commitear **con la misma ruta relativa** (`package.json`, `README.md`, `src/App.tsx`: coinciden entre
   repos constantemente).
2. En el workspace A, abrir Source Control y pedir descartar ese fichero (o "Discard all").
3. Con el dialogo de confirmacion abierto, pulsar Mod+Alt+Flecha abajo para pasar al workspace B.
4. Confirmar el descarte.
5. Esperado segun la lectura del codigo: se descartan los cambios del fichero **en el repo de B**, no en
   el de A. Los cambios sin commitear de B se pierden sin posibilidad de recuperarlos.

Comprobar tambien el caso `scope: "all"`: `executeDiscard` recibe la lista explicita de entradas de A, asi
que en B se descartaria toda ruta de A que exista y este modificada en B. Sigue necesitando coincidencia
de rutas, pero con "todos los cambios" la superficie es mucho mayor.

## Relacion con el fix ya mergeado d24814e

`d24814e` ("fix(source-control): guard against acting on a stale repo during a fast context switch") ya
esta en `main` y añadio la maquinaria correcta, pero **no cubre el descarte**: un `git show d24814e` no
menciona ni `pendingDiscard` ni `executeDiscard`. Lo que aporto es `src/modules/source-control/repoReuse.ts`
con `isContextSwitching(hasRepo, contextPath, resolvedContext)`, cuyo propio comentario dice que es "true
from the instant the context path changes, not just once a refetch starts, so the UI can block interaction
with the outgoing repo before any request is even in flight". Esa señal se expone como
`summary.isSwitchingContext` y es exactamente la que le falta a este camino.

## Fix sugerido

Dos capas, y conviene poner las dos porque cubren ventanas distintas:

1. **Capturar el `repoRoot` al pedir el descarte, no al confirmarlo.** Añadir el root al payload de
   `pendingDiscard` en los tres `requestDiscard*`, y que `executeDiscard` reciba ese root capturado en vez
   de leer `repo.repoRoot`. Ademas, al confirmar, abortar si el root capturado ya no coincide con el repo
   vivo (mejor no hacer nada y avisar que descartar en el sitio equivocado). Esto es lo mismo que se hizo
   en la vista de notas para el bug equivalente: alli el arreglo fue limpiar el estado al cambiar de raiz
   (`src/modules/notes/NotesView.tsx`, efecto de reset con deps `[props.active, canonRoot]`).

2. **Limpiar `pendingDiscard` cuando cambie el repo**, en el mismo efecto que ya limpia `repo`, `status` y
   `selected` (`:564-598`), para que el dialogo no se quede abierto describiendo un repo que ya no se ve.

Y de paso, por coherencia con los seis hermanos del mismo fichero: añadir `summary.isSwitchingContext` a la
guardia de los tres `requestDiscard*`, y `disabled` al `AlertDialogAction` cuando
`scm.actionBusy` este puesto (ya incluye el centinela `CONTEXT_SWITCH_BUSY_KEY`, `:928`).

Test que fija el invariante: el nucleo puro esta en `repoReuse.ts`, pero esta logica vive en el hook. Lo
mas barato es extraer una funcion pura del estilo
`resolveDiscardTarget(pending, liveRepoRoot): { entries, repoRoot } | null` que devuelva `null` cuando el
root capturado y el vivo no coinciden, y cubrirla en `repoReuse.test.ts` o en un test nuevo del panel.

## Nota de alcance

Este fallo es de `main` y es **anterior e independiente** de la vista de notas. Se encontro al preguntar si
el bug critico que se arreglo en la vista de notas (confirmar un borrado tras cambiar de workspace) pasaba
tambien con ficheros normales. La respuesta fue que no: el explorer guarda la ruta **absoluta** y la pasa
tal cual a `fs_delete` (`src/modules/explorer/FileExplorer.tsx:403-406` guarda `{ path, isDir }` con path
absoluto; `src/modules/explorer/lib/useFileTree.ts:584-589` lo usa sin recomponer), asi que es inmune. El
patron peligroso es concretamente **guardar ruta relativa y recomponerla contra una raiz que puede haber
cambiado**, y en el codigo actual solo lo hacia la vista de notas (ya arreglado) y lo sigue haciendo este
camino del panel de git.

## Relacionado

- El bug equivalente ya arreglado en la vista de notas, en la rama `notes-sidebar-view`.
- `d24814e`, que introdujo `isContextSwitching` y guardo otros caminos del mismo panel.
