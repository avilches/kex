# Duplicate File/Folder en el explorer

## Objetivo

Anadir una opcion "Duplicate" en el menu contextual del explorer, debajo de New File / New
Folder, que permita duplicar un fichero o una carpeta. La copia se ejecuta en background con
buffer, muestra una barra de progreso global en la esquina inferior izquierda de la ventana
principal, y puede cancelarse (deshaciendo lo copiado, sin dejar residuos). Solo se permite una
duplicacion a la vez.

## Decisiones de diseno (confirmadas)

- **Alcance**: ficheros y carpetas. Carpetas se copian recursivamente.
- **Input inicial**: el input inline aparece justo debajo del elemento que se duplica (dentro de
  su carpeta padre), pre-rellenado con un nombre sugerido sin colision (`pepe copy.txt`,
  `pepe copy 2.txt`; `src copy`, `src copy 2`), con el nombre base preseleccionado. Enter copia
  directo sin teclear nada; Esc cancela sin hacer nada.
- **Formato del nombre**: `<base> copy<.ext>` con espacio (estilo macOS). Para incrementos:
  `<base> copy N<.ext>`.
- **Colision**: si el nombre tecleado ya existe en la carpeta, error (toast) y no copia; el input
  se reabre para corregir.
- **Barra de progreso**: global, una sola, en la main window (esquina inferior izquierda), overlay
  flotante por encima del StatusBar. Settings y float browser windows no la muestran.
- **Cancelacion**: boton `x` en la barra que para la copia y borra lo copiado (no queda nada).

## Backend (Rust) — `src-tauri/src/modules/fs/duplicate.rs`

### Estado gestionado

```rust
pub struct CopyState { job: Mutex<Option<Arc<CopyJob>>> }
pub struct CopyJob   { cancelled: AtomicBool }
```

Un unico slot: solo una duplicacion a la vez. Se registra con `.manage(CopyState::default())`.

### `CopyProgress` (payload del Channel)

```rust
struct CopyProgress { copied: u64, total: u64, done: bool, cancelled: bool, error: Option<String> }
```

### Comando `fs_duplicate`

```rust
#[tauri::command]
pub async fn fs_duplicate(
    state: State<'_, CopyState>,
    source: String,
    dest: String,
    workspace: Option<WorkspaceEnv>,
    on_progress: Channel<CopyProgress>,
) -> Result<(), String>
```

Flujo:
1. Resuelve `source` y `dest` con `resolve_path`. Valida que `source` existe y `dest` NO existe
   (colision -> `Err`, no toca nada).
2. Rechaza si ya hay un job activo en el slot.
3. Pre-calcula `total_bytes`: walk recursivo sumando tamanos de fichero (para fichero unico, su
   size).
4. Inserta el `CopyJob` en el slot. `spawn_blocking`:
   - Copia recursiva con buffer (chunks de ~256 KB). Para fichero: loop read/write. Para dir:
     crea el arbol y copia cada fichero.
   - Tras cada chunk acumula `copied` y emite `CopyProgress` por el channel con throttle
     (~cada 50 ms o cada 1% de avance) para no saturar.
   - Antes de cada chunk / cada fichero comprueba `cancelled`.
5. Cancelado o error a mitad -> borra el destino top-level creado (`remove_file` /
   `remove_dir_all`) para no dejar residuos. Emite progreso final `cancelled` o `error`.
6. OK -> emite `done` (copied == total). Copia los permisos del origen al final (best-effort).
7. Siempre limpia el slot del state al terminar (exito, error o cancelacion).

### Comando `fs_duplicate_cancel`

```rust
#[tauri::command]
pub fn fs_duplicate_cancel(state: State<'_, CopyState>)
```

Marca `cancelled = true` en el job activo (si lo hay). El worker detecta el flag, deshace y emite
el progreso final.

### Registro

`lib.rs`: `.manage(CopyState::default())` y ambos comandos en `generate_handler!`.

### Tests Rust

- Copia de un fichero: contenido identico en destino.
- Copia recursiva de un dir: estructura y contenidos identicos.
- Colision: `dest` ya existe -> `Err`, destino existente intacto.
- Cancelacion: al cancelar a mitad, el destino top-level no existe (limpieza completa).

## Frontend

### Store global — `src/modules/explorer/lib/duplicateStore.ts`

Estado mutable externo expuesto via `useSyncExternalStore` (regla CLAUDE.md): snapshot cacheado a
nivel de modulo, `notify()` recalcula y notifica.

```ts
type DuplicateProgress = { name: string; copied: number; total: number } | null;
```

API: `start(name)`, `update(copied, total)`, `finish()`, `getSnapshot()`, `subscribe()`.

### Input inline — estado `pendingDuplicate`

Nuevo estado en `useFileTree.ts`:

```ts
type PendingDuplicate = { sourcePath: string; parentPath: string; kind: "file" | "dir"; suggestedName: string };
```

- `beginDuplicate(sourcePath, kind)`: calcula `suggestedName` con `suggestDuplicateName`, fija
  `pendingDuplicate`.
- En `buildRows` (`FileExplorer.tsx`): cuando la fila actual es `pendingDuplicate.sourcePath`,
  inserta una fila `InlineInput` justo debajo de ese elemento (no al final de la carpeta como New
  File). Pre-rellena con `suggestedName`, base preseleccionada (reutiliza la logica de seleccion
  del `InlineInput`).
- Esc -> `cancelDuplicate()` (limpia `pendingDuplicate`).
- Enter -> `commitDuplicate(name)`.

### `commitDuplicate(name)`

1. `destPath = join(parentPath, name)`.
2. Valida colision contra los hijos conocidos: si existe -> `toast.error` y mantiene el input
   abierto.
3. Limpia `pendingDuplicate`.
4. `duplicateStore.start(name)`. Crea `Channel<CopyProgress>`; `onmessage` -> `duplicateStore.update`.
5. `await invoke("fs_duplicate", { source, dest, workspace, onProgress })`.
6. Exito -> `duplicateStore.finish()`, `fetchChildren(parentPath)` (refresca si el dir esta
   montado; el watcher fs tambien refresca por su cuenta).
7. Error -> `duplicateStore.finish()`, `toast.error`.

### Barra de progreso — `src/modules/explorer/DuplicateProgressBar.tsx`

Montada en `App.tsx`. Overlay flotante anclado abajo-izquierda, por encima del StatusBar. Lee el
store con `useSyncExternalStore`; si el snapshot es `null` no renderiza nada. Muestra
`Duplicating <name> [#####-----]` (barra ASCII/visual segun `copied/total`) y un boton `x` que
invoca `fs_duplicate_cancel`.

### Generador de nombre — `suggestDuplicateName(name, kind, siblings)`

Funcion pura, testeable con vitest:
- Fichero `pepe.txt` -> `pepe copy.txt`; si existe -> `pepe copy 2.txt`, etc.
- Carpeta `src` -> `src copy`; si existe -> `src copy 2`.
- Respeta la extension (insertando ` copy` antes del ultimo punto del nombre de fichero).

### Menu contextual — `TreeRow.tsx`

Item "Duplicate" debajo de New File / New Folder, visible en ficheros y carpetas, que llama
`actions.beginDuplicate(path, kind)`.

## Fuera de alcance (YAGNI)

- Multiples duplicaciones simultaneas.
- Duplicar a otra carpeta distinta del padre.
- Preservar mtime/owner mas alla de permisos best-effort.
- Mostrar la barra en Settings / float browser windows.
