# Borrado en el explorer: tecla Del + modal de confirmacion con papelera

## Objetivo

Mejorar el borrado de ficheros y carpetas en el explorer:

1. Anadir la tecla `Del` (Suprimir, no Backspace) como atajo para borrar el item seleccionado.
2. Mostrar ese atajo en el menu contextual y hacerlo reasignable desde Settings (registry de shortcuts).
3. Reemplazar la confirmacion inline de doble-click ("Click again to confirm") por un modal de confirmacion.
4. El modal ofrece tres acciones: `Cancel`, `Delete` (permanente) y `Move to trash` (papelera del sistema).

## Estado actual (referencia)

- Menu contextual de delete: `src/modules/explorer/TreeRow.tsx` (~lineas 353-368). Confirmacion inline con `isConfirming`
  (doble-click). Ejecuta `actions.deletePath(path)`.
- Handler de teclado local del arbol: `src/modules/explorer/FileExplorer.tsx` (`handleKeyDown`, ~lineas 652-731). Usa
  `matchesShortcut(e.nativeEvent, "file.rename", userShortcuts)` para rename (F2) y maneja flechas/Enter. No hay tecla
  Delete. La guarda inicial corta cuando `tree.renaming || tree.pendingCreate || tree.pendingDuplicate || isSearchOpen`.
- Registry de shortcuts: `src/modules/shortcuts/shortcuts.ts`. No existe `file.delete`. `file.rename` es el precedente
  directo (group `General`, default `F2`, consumido localmente con `matchesShortcut`).
- Backend: `src-tauri/src/modules/fs/mutate.rs::fs_delete` borra permanentemente (`remove_dir_all` / `remove_file`). No
  hay crate `trash` en `Cargo.toml`.
- UI: `AlertDialog` de shadcn (`src/components/ui/alert-dialog.tsx`), ya usado en
  `src/modules/explorer/DuplicateQuitModal.tsx`. Soporta 3 botones.

## Diseno

### Backend (Rust)

- Anadir el crate `trash` (cross-platform: macOS, Linux, Windows) a `src-tauri/Cargo.toml`.
- Nuevo comando `fs::mutate::fs_trash(path: String, workspace: Option<WorkspaceEnv>) -> Result<(), String>`:
  - Resuelve el path con `resolve_path` igual que `fs_delete`.
  - Valida existencia con `symlink_metadata` (mismo patron y manejo de symlinks que `fs_delete`).
  - Mueve a la papelera del sistema con `trash::delete`.
  - Mapea el error a `String` con `log::warn!`, igual que `fs_delete`.
- Registrar `fs_trash` en `src-tauri/src/lib.rs` (junto a `fs::mutate::fs_delete`).
- `fs_delete` se mantiene intacto para el borrado permanente.
- Tests en `mutate.rs`: crear un fichero temporal, llamar `fs_trash`, verificar que ya no existe en su ruta original.
  Anadir caso de path inexistente devuelve error.

### Shortcut

- Nueva entrada en `SHORTCUTS` (`shortcuts.ts`):
  - `id: "file.delete"`, `label: "Delete file"`, `group: "General"`, `defaultBindings: [{ key: "Delete" }]`.
- Anadir `"file.delete"` al union `ShortcutId`.
- Consumo local en el explorer (mismo patron que `file.rename`), no global: en `handleKeyDown` de `FileExplorer.tsx`,
  `matchesShortcut(e.nativeEvent, "file.delete", userShortcuts)` actuando sobre el `selectedPath`.
- Justificacion de configurable (vs hardcode): a diferencia de copiar/pegar, el atajo de borrar no es universal entre
  plataformas (Windows/Linux `Delete`; macOS Finder `Cmd+Backspace`), la convencion del repo prohibe hardcodear atajos,
  y `file.rename` ya sienta el precedente.

### Modal: `DeleteEntryModal.tsx`

- Nuevo componente en `src/modules/explorer/`, basado en `AlertDialog`.
- Props: `open: boolean`, `name: string`, `isDir: boolean`, `onCancel: () => void`, `onDelete: () => void`,
  `onTrash: () => void`.
- Titulo: `Delete file "<name>"?` o `Delete folder "<name>"?` segun `isDir`.
- Footer con 3 botones, de izquierda a derecha:
  1. `Cancel` (`AlertDialogCancel`).
  2. `Delete` en rojo (`variant="destructive"`), borrado permanente.
  3. `Move to trash`, boton primario destacado, con el foco por defecto al abrir (se ejecuta con Enter).
- Escape y `Cancel` cierran sin efecto.

### Cableado

- Levantar el estado del modal (`pendingDelete`: el path pendiente y su `isDir`) a `FileExplorer` para que haya un
  unico modal compartido por la tecla Del y el menu contextual.
- `TreeRow.tsx`: el `ContextMenuItem` "Delete" deja de usar `isConfirming`/doble-click y pasa a abrir el modal via una
  accion nueva (p. ej. `actions.requestDelete(path)`). Mostrar el atajo con `ContextMenuShortcut` (label derivada del
  binding actual de `file.delete`, default `Del`).
- `handleKeyDown`: anadir `pendingDelete` a la guarda inicial para no navegar con el modal abierto; al hacer match de
  `file.delete` con `selectedPath`, abrir el modal.
- Al confirmar:
  - `Move to trash` -> `invoke("fs_trash", ...)`.
  - `Delete` -> borrado permanente (lo que hoy hace `deletePath` via `fs_delete`).
  - En ambos casos: refresco del arbol y ajuste de seleccion como en el flujo actual de `deletePath`.

## Decisiones tomadas

- Accion destacada/default del modal: `Move to trash`. `Delete` en rojo como accion destructiva secundaria.
- El menu contextual pasa a abrir el modal (se elimina el doble-click inline).
- El atajo es reasignable via registry, default `Delete`.
- Borrado de uno en uno: el explorer mantiene un unico `selectedPath` (no hay multiseleccion).

## Riesgos y limitaciones

- El test de `fs_trash` puede comportarse distinto en CI headless. En Linux el crate escribe en
  `~/.local/share/Trash` (funciona sin GUI). Si en macOS CI falla, marcar ese test como `#[ignore]` documentando el
  motivo, manteniendo el resto de la verificacion.

## Documentacion a actualizar (mismo commit que el codigo)

- `docs/IPC.md`: anadir `fs_trash` a la superficie `fs::*`.
- `docs/ARCHITECTURE.md` solo si el modelo o el modulo cambian de forma significativa (no se espera).

## Verificacion

- `pnpm lint`, `pnpm check-types`, `pnpm test`.
- `cd src-tauri && cargo clippy && cargo test --locked`.
