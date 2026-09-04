---
id: TASK-630
title: 'IMP-NOTES-03: sin indicador visual de carga en la lista de notas'
status: To Do
assignee: []
created_date: '2026-09-04 01:30'
labels: []
dependencies: []
references:
  - docs/pending/improvements/IMP-NOTES-03-sin-indicador-de-carga.md
priority: low
type: task
ordinal: 623000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
# IMP-NOTES-03: sin indicador visual de carga en la lista de notas

Estado: pendiente

## Contexto

`src/modules/notes/NoteListColumn.tsx` recibe `props.loading` (viene del flag
`loading` que devuelve `src/modules/notes/lib/useNotesDirs.ts` y que `NotesView`
le pasa) pero solo lo usa para suprimir el mensaje de "No notes here. Create one
with the + button." mientras la lectura de la carpeta esta en curso (linea 195:
`sorted.length === 0 && !props.loading`) y para deshabilitar el nuevo boton de
refresh (FIX B). No hay spinner, skeleton, ni ningun otro feedback visual: la
lectura de una carpeta deja la lista en blanco mientras esta en vuelo, algo mas
visible la primera vez que se lee una carpeta con muchas notas.

## Mejora propuesta

Anadir un estado de carga visible (spinner pequeno o skeleton de filas) en el
cuerpo de la lista mientras `props.loading` es `true` y todavia no hay notas que
mostrar. El flag ya esta disponible, solo falta la UI.

## Relacionado

- `src/modules/notes/NoteListColumn.tsx`
- `src/modules/notes/lib/useNotesDirs.ts`
<!-- SECTION:DESCRIPTION:END -->
