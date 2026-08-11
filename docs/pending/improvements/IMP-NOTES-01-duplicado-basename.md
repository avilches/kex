# IMP-NOTES-01: helper `baseName`/`basename` duplicado en tres sitios

Estado: pendiente (limpieza de reuso, no una nueva abstraccion)

## Contexto

La misma funcion, byte a byte, existe en tres archivos:

- `src/modules/notes/CollectionsColumn.tsx`, lineas 56-59 (`baseName`).
- `src/modules/notes/NoteRow.tsx`, lineas 38-41 (`baseName`).
- `src/modules/notes/NotesView.tsx`, funcion local `basename` anadida en la ronda de
  FIX A (delete/trash con `DeleteEntryModal`), con el mismo cuerpo.

Y una version equivalente, backslash-aware, ya vive en
`src/modules/workspaces/lib/tabTitle.tsx` (`export function basename(path: string)`,
linea 14), usada alli para derivar el titulo de un tab a partir de su `path`.

## Objetivo

Eliminar las tres copias del modulo de notas y que las tres importen la version de
`tabTitle.tsx` (o, si se prefiere no acoplar `notes/` a `workspaces/lib/tabTitle.tsx`
por motivos de layering, mover la funcion a un sitio neutral como `src/lib/paths.ts`
y que los cuatro sitios importen desde ahi). No cambiar la firma ni el
comportamiento, solo el punto de definicion.

## Relacionado

- `src/modules/notes/CollectionsColumn.tsx`
- `src/modules/notes/NoteRow.tsx`
- `src/modules/notes/NotesView.tsx`
- `src/modules/workspaces/lib/tabTitle.tsx`
