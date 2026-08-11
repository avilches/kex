# IMP-NOTES-04: navegacion por teclado en filas de notas y carpetas

Estado: pendiente (feature de seguimiento, no un fix de lint)

## Contexto

El modulo de notas aporta 8 de los warnings de accesibilidad de biome
(`noStaticElementInteractions`, `useKeyWithClickEvents`) porque las filas de nota
(`src/modules/notes/NoteRow.tsx`) y de carpeta (`src/modules/notes/CollectionsColumn.tsx`,
`FolderRow`) son `<div>` clicables sin ningun manejador de teclado. El resto del
codebase tiene los mismos warnings en las mismas reglas, asi que esto es
consistente con la base existente, no una regresion introducida por esta feature.
Pero el explorer de ficheros, la vista hermana mas cercana, ya tiene navegacion por
teclado real (flechas, Enter), y la vista de notas es la que se queda atras en
comparacion directa.

## Mejora propuesta

Tratar esto como una feature de seguimiento, no un parche de lint: navegacion con
flechas arriba/abajo entre filas de nota y de carpeta en ambas columnas
(`CollectionsColumn`, `NoteListColumn`), y Enter para abrir la fila con foco,
siguiendo el mismo patron que ya usa el explorer.

## Relacionado

- `src/modules/notes/NoteRow.tsx`
- `src/modules/notes/CollectionsColumn.tsx`
- `src/modules/notes/NoteListColumn.tsx`
- Modulo `explorer/` (referencia de navegacion por teclado ya implementada)
