# IMP-NOTES-03: sin indicador visual de carga en la lista de notas

Estado: pendiente

## Contexto

`src/modules/notes/NoteListColumn.tsx` recibe `props.loading` (viene de
`index.loading`, `useNotesIndex`) pero solo lo usa para suprimir el mensaje de
"No notes here. Create one with the + button." mientras el primer escaneo esta en
curso (linea 217: `sorted.length === 0 && !props.loading`) y para deshabilitar el
nuevo boton de refresh (FIX B). No hay spinner, skeleton, ni ningun otro feedback
visual: durante el primer walk de un vault grande, el area de la lista se queda en
blanco sin indicacion de que algo esta pasando.

## Mejora propuesta

Anadir un estado de carga visible (spinner pequeno o skeleton de filas) en el
cuerpo de la lista mientras `props.loading` es `true` y todavia no hay notas que
mostrar. El flag ya esta disponible, solo falta la UI.

## Relacionado

- `src/modules/notes/NoteListColumn.tsx`
- `src/modules/notes/lib/useNotesIndex.ts`
