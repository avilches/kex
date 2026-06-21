# Quit while a duplication is in progress

## Objetivo

Cuando el usuario pide cerrar la aplicacion (Cmd+Q / menu Quit) y hay una duplicacion de
fichero/carpeta en curso, no cerrar inmediatamente: mostrar un modal en todas las ventanas con el
progreso de la copia y dos acciones. Si el usuario no hace nada, la app cierra automaticamente al
terminar la copia.

## Comportamiento (confirmado)

- **Quit con duplicacion activa**: el backend intercepta el quit, marca `quit_pending`, y emite un
  evento global que abre el modal en todas las ventanas que renderizan nuestro frontend (ventanas
  principales `w-*` y Settings). Las float browser windows cargan webs externas y no pueden mostrar
  el modal (limitacion tecnica documentada).
- **Sin interaccion**: al terminar la copia, `quit_pending` dispara el cierre normal (flush de
  editores + estado de workspace, via el `kex:before-quit` existente, luego `confirm_quit`).
- **"Keep app open"**: resetea `quit_pending`, cierra el modal en todas las ventanas; la copia sigue
  y la app permanece abierta.
- **"Cancel copy & quit"**: aborta la copia (`fs_duplicate_cancel`, que ya borra el parcial). Como
  `quit_pending` sigue activo, al terminar la cancelacion la app cierra sola (mismo camino que el
  caso sin interaccion).

## Modal (UI)

AlertDialog (no se cierra con click-fuera ni Esc; es decision obligatoria). Contenido:

```
Duplication in progress

Duplicating  <name>
[######------------]  42%

The app will close automatically when the copy finishes.

            [ Keep app open ]   [ Cancel copy & quit ]
```

La barra se actualiza en vivo con el progreso. `pct = total > 0 ? round(copied/total*100) : 0`.

## Cambio arquitectonico: progreso por evento global

Hoy el progreso viaja por un `Channel<CopyProgress>` privado a la ventana que invoco `fs_duplicate`.
Para que el modal lo muestre en cualquier ventana (incluida Settings, que no lanzo la copia), el
progreso pasa a ser un **evento global de app**.

- `fs_duplicate` deja de recibir `on_progress: Channel`; recibe `app: AppHandle` y emite
  `app.emit("kex:duplicate-progress", DuplicateProgressEvent)` con throttle ~50ms.
- `DuplicateProgressEvent { name: string, copied: number, total: number, active: boolean }`.
  `active: false` en el evento final (done/cancelled/error) marca el fin.
- `CopyState` guarda el snapshot actual `{ name, copied, total }` (bajo Mutex) para incluirlo en el
  payload del evento de quit-prompt, de modo que un modal recien montado tenga el valor inicial.

## Backend (Rust)

### Estado

- `CopyState` extendido: `current: Mutex<Option<CopySnapshot>>` ademas del `job` existente.
  `CopySnapshot { name: String, copied: u64, total: u64 }`.
- `QuitGuard` gana un segundo flag `pending: AtomicBool` (quit deferido por una duplicacion activa),
  independiente del `confirmed` flag existente.

### `fs_duplicate` (refactor)

- Firma: quita `on_progress: Channel`, anade `app: tauri::AppHandle`. Deriva `name` del basename de
  `dest`.
- En cada emision (inicial, throttled, final) actualiza `state.current` y hace
  `app.emit("kex:duplicate-progress", { name, copied, total, active })`.
- Al terminar (exito, cancel o error): pone `state.current = None`, emite el evento final con
  `active: false`, libera el `job` slot. **Luego, si `QuitGuard.pending` esta activo**, emite
  `app.emit("kex:before-quit", ())` para que el frontend flushee y confirme el cierre.
- La logica de copia (`copy_job`/`copy_inner`/`cleanup`/`dir_size`) y sus tests no cambian.

### ExitRequested handler (lib.rs)

- Si `QuitGuard.confirmed` -> return (deja salir), como ahora.
- Si hay `job` activo en `CopyState` (duplicacion en curso):
  - `api.prevent_exit()`, set `QuitGuard.pending = true`, emite
    `app.emit("kex:duplicate-quit-prompt", snapshot)` con el `CopyState.current` actual. No emite el
    `kex:before-quit` normal. Si `pending` ya estaba activo, no re-emite (evita doble prompt).
- Si NO hay job: comportamiento actual (prevent_exit, set confirmed, emit `kex:before-quit`).

### Comandos nuevos

- `cancel_quit(app)`: `QuitGuard.pending = false`, emite `app.emit("kex:duplicate-quit-dismissed",())`.
- `fs_duplicate_cancel` ya existe (sin cambios).

## Frontend

### Store global del progreso (`duplicateStore.ts`, refactor)

- Deja de exponer `startDuplicate`/`updateDuplicate`/`finishDuplicate`.
- Un init `initDuplicateProgressListener()` (idempotente, llamado una vez por ventana) escucha
  `kex:duplicate-progress`: si `active`, fija el snapshot `{ name, copied, total }`; si no, lo limpia.
- Mantiene `useDuplicateProgress()` y `isDuplicating()` leyendo el mismo snapshot cacheado
  (patron `useSyncExternalStore`).

### `native.ts`

- `duplicate(source, dest)`: sin Channel ni callback, solo `invoke("fs_duplicate", { source, dest,
  workspace })`.
- `cancelQuit()`: `invoke("cancel_quit")`. `cancelDuplicate()` ya existe.

### `useFileTree.commitDuplicate`

- Ya no pasa callback ni llama a los mutadores del store (el progreso llega por el evento global).
- Mantiene: validacion de nombre vacio, gate `isDuplicating()`, colision (toast + cierra input),
  `await native.duplicate(...)`, `fetchChildren` en exito, `toast.error` en fallo. La barra inferior
  aparece/desaparece sola via el evento global.

### Modal `DuplicateQuitModal.tsx`

- Escucha `kex:duplicate-quit-prompt` (abre, con snapshot inicial del payload) y
  `kex:duplicate-quit-dismissed` (cierra). Lee el progreso vivo de `useDuplicateProgress()`.
- AlertDialog no dismissable. Botones: "Keep app open" -> `native.cancelQuit()`; "Cancel copy &
  quit" -> `native.cancelDuplicate()`.
- Montado en `App.tsx` y en `SettingsApp.tsx`. El init del listener de progreso tambien se llama en
  ambos entry points para que el modal tenga progreso en cualquier ventana.

## Fuera de alcance (YAGNI)

- Mostrar el modal en float browser windows (webs externas, imposible montar React propio).
- Cola de multiples duplicaciones (sigue siendo una a la vez).
- Persistir/resumir una copia a traves de un cierre.
