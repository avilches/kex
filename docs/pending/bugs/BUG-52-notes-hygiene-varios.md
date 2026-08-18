---
id: BUG-52
title: Varios items de correccion y limpieza de bajo impacto en el stack de notas
area: notes
severity: low
status: sin confirmar
---

## Descripcion

Cuatro items pequenos encontrados durante la revision final de la vista de notas.
Ninguno es urgente por si solo; se agrupan aqui para no perderlos.

1. **`read_head` con lectura corta y posible corte de UTF-8 multibyte.**
   `src-tauri/src/modules/fs/notes.rs`, funcion `read_head` (lineas 32-39), hace
   una unica llamada `f.read(&mut buf)` (linea 35) para llenar un buffer de
   `HEAD_BYTES` = 2048 bytes (linea 12). `read` puede devolver menos bytes de los
   pedidos sin que eso sea EOF (short read), asi que el snippet podria quedar mas
   corto de lo esperado sin motivo. Ademas, `String::from_utf8_lossy(&buf)`
   (linea 38) se aplica sobre ese buffer truncado a un limite fijo de bytes: si el
   corte cae a mitad de un caracter multibyte, el ultimo caracter del snippet se ve
   como un caracter de sustitucion (`�`). Cambiar a `read_exact` sobre un buffer mas
   pequeno con manejo de EOF, o a `take(2048).read_to_end`, resuelve la lectura
   corta; recortar el buffer al limite del ultimo caracter UTF-8 completo antes de
   `from_utf8_lossy` resuelve el corte multibyte.

2. **`formatRelativeDate` siempre usa `mtime`, incluso con `sortMode: "created"`.**
   `src/modules/notes/NoteRow.tsx`, linea 132, renderiza
   `formatRelativeDate(note.mtime, Date.now())` sin condicion. Cuando el usuario
   ordena por "Created" (`NoteListColumn.tsx`, `SORT_LABELS.created`), la fecha que
   se ve en cada fila sigue siendo la de modificacion, no la de creacion que motivo
   el orden. `NoteRow` no recibe el modo de orden actual como prop, asi que el fix
   requiere pasarselo desde `NoteListColumn` (que ya sabe `config.sortMode`) o pasar
   directamente la fecha a mostrar ya resuelta.

3. **`quickAccess` colgado en `kex.json` sin auto-reparacion.**
   `pruneNotesConfig` ya poda, cada vez que la vista se activa, `expandedFolders`,
   `folderOrder` y `selectedFolder` contra lo que el filesystem confirma que existe
   (`notes_paths_exist`): carpetas que ya no estan, nombres de fichero que ya no
   existen, y una `selectedFolder` que desaparecio. `quickAccess` queda
   deliberadamente fuera de esa poda: fijar una nota es intencion explicita del
   usuario, y la fila en gris es la senal de que la nota ya no existe. Lo que sigue
   sin arreglar es que abrir un pin fantasma (`CollectionsColumn.tsx`,
   `QuickAccessRow`, rama `!props.note`) dispara un error de lectura en vez de, por
   ejemplo, ofrecer quitarlo de la lista.

4. **Dos ventanas en el mismo vault: last-writer-wins sobre `kex.json`.**
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
bloquea el uso normal. El item 1 es limpieza/robustez sin sintoma visible hoy
(2048 bytes es raro que corte un vault real de forma perceptible). Los items 2,
3 y 4 son pequenas inconsistencias de UX que un usuario podria notar pero que no
impiden trabajar.

## Fix sugerido

Ver el fix descrito en cada punto arriba. Ninguno depende de los demas; se pueden
resolver en cualquier orden o de forma independiente.

## Relacionado

- `src-tauri/src/modules/fs/notes.rs` (item 1).
- `src/modules/notes/NoteRow.tsx`, `src/modules/notes/NoteListColumn.tsx` (item 2).
- `src/modules/notes/lib/useNotesState.ts`, `src/modules/notes/lib/notesConfig.ts`
  (`pruneNotesConfig`), `src/modules/notes/CollectionsColumn.tsx` (item 3 y 4).
