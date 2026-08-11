---
id: BUG-52
title: Varios items de correccion y limpieza de bajo impacto en el stack de notas
area: notes
severity: low
status: sin confirmar
---

## Descripcion

Cinco items pequenos encontrados durante la revision final de la vista de notas.
Ninguno es urgente por si solo; se agrupan aqui para no perderlos.

1. **`NoteListItem.path` es un payload muerto en el frontend.**
   `src-tauri/src/modules/fs/notes.rs` (`NoteListItem.path`, linea 20) devuelve la
   ruta absoluta canonica de cada nota, pero nada en el frontend la lee: `NotesView`
   reconstruye la ruta con `abs(relPath)` (`src/modules/notes/NotesView.tsx`) en vez
   de usar `note.path`. El campo (un string largo, uno por nota, en cada refresh de
   `notes_list`) es puro coste sin uso. `src/modules/notes/lib/notesList.ts` espeja
   el tipo con el mismo campo `path: string`. `docs/IPC.md` tambien lo documenta
   ("por nota `path`, `relPath`, `title` ..."). El fix es eliminar el campo (Rust +
   tipo TS + mencion en `docs/IPC.md`) o, si se decide que hace falta en algun
   futuro caso de uso, empezar a usarlo.

2. **`read_head` con lectura corta y posible corte de UTF-8 multibyte.**
   `src-tauri/src/modules/fs/notes.rs`, funcion `read_head` (lineas 158-165), hace
   una unica llamada `f.read(&mut buf)` (linea 161) para llenar un buffer de
   `HEAD_BYTES` = 2048 bytes (linea 13). `read` puede devolver menos bytes de los
   pedidos sin que eso sea EOF (short read), asi que el snippet podria quedar mas
   corto de lo esperado sin motivo. Ademas, `String::from_utf8_lossy(&buf)`
   (linea 164) se aplica sobre ese buffer truncado a un limite fijo de bytes: si el
   corte cae a mitad de un caracter multibyte, el ultimo caracter del snippet se ve
   como un caracter de sustitucion (`�`). Cambiar a `read_exact` sobre un buffer mas
   pequeno con manejo de EOF, o a `take(2048).read_to_end`, resuelve la lectura
   corta; recortar el buffer al limite del ultimo caracter UTF-8 completo antes de
   `from_utf8_lossy` resuelve el corte multibyte.

3. **`formatRelativeDate` siempre usa `mtime`, incluso con `sortMode: "created"`.**
   `src/modules/notes/NoteRow.tsx`, linea 132, renderiza
   `formatRelativeDate(note.mtime, Date.now())` sin condicion. Cuando el usuario
   ordena por "Created" (`NoteListColumn.tsx`, `SORT_LABELS.created`), la fecha que
   se ve en cada fila sigue siendo la de modificacion, no la de creacion que motivo
   el orden. `NoteRow` no recibe el modo de orden actual como prop, asi que el fix
   requiere pasarselo desde `NoteListColumn` (que ya sabe `config.sortMode`) o pasar
   directamente la fecha a mostrar ya resuelta.

4. **Estado colgado en `kex.json` sin auto-reparacion.**
   `src/modules/notes/lib/useNotesState.ts` solo actualiza `quickAccess` y
   `selectedFolder` como reaccion a operaciones hechas desde dentro de Kex
   (`notePathDeleted`, `notePathRenamed`, ambas invocadas explicitamente desde
   `NotesView.tsx`). Si una nota se borra o renombra fuera de Kex (otro editor, la
   terminal, git), su entrada en `quickAccess` queda huerfana para siempre: la fila
   se renderiza en gris (`CollectionsColumn.tsx`, `QuickAccessRow`, rama
   `!props.note`) y abrirla dispara un error de lectura. Lo mismo con
   `selectedFolder` apuntando a una carpeta que ya no existe: la lista de notas se
   queda vacia sin ninguna senal de que la carpeta desaparecio. `useNotesIndex` ya
   conoce el conjunto de paths y carpetas vigentes en cada refresh
   (`src/modules/notes/lib/useNotesIndex.ts`), asi que podar `quickAccess` y
   resetear `selectedFolder` contra ese conjunto en cada carga seria barato.

5. **Dos ventanas en el mismo vault: last-writer-wins sobre `kex.json`.**
   `src/modules/notes/lib/useNotesState.ts` (`kexJsonPath`, `scheduleWrite`) lee y
   reescribe el mismo `kex.json` por vault, sin ningun tipo de merge ni lock entre
   procesos. Si el usuario tiene el mismo vault abierto en dos ventanas de Kex, el
   ultimo `write` (debounced 300ms, por ventana) pisa el estado de notas
   (`quickAccess`, `selectedFolder`, `sortMode`, etc.) que la otra ventana acaba de
   guardar. Es un comportamiento aceptable para una app de un solo usuario en un
   solo proceso a la vez, pero no esta documentado en ningun lado como limitacion
   conocida.

## Impacto

Bajo en todos los casos: nada de esto corrompe datos de forma irreversible ni
bloquea el uso normal. Los items 1 y 2 son limpieza/robustez sin sintoma visible
hoy (2048 bytes es raro que corte un vault real de forma perceptible). Los items 3,
4 y 5 son pequenas inconsistencias de UX que un usuario podria notar pero que no
impiden trabajar.

## Fix sugerido

Ver el fix descrito en cada punto arriba. Ninguno depende de los demas; se pueden
resolver en cualquier orden o de forma independiente.

## Relacionado

- `src-tauri/src/modules/fs/notes.rs`, `docs/IPC.md` (item 1 y 2).
- `src/modules/notes/NoteRow.tsx`, `src/modules/notes/NoteListColumn.tsx` (item 3).
- `src/modules/notes/lib/useNotesState.ts`, `src/modules/notes/lib/useNotesIndex.ts`,
  `src/modules/notes/CollectionsColumn.tsx` (item 4 y 5).
