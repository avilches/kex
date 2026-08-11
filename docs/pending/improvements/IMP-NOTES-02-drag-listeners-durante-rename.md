# IMP-NOTES-02: listeners de drag activos durante el rename inline de una nota

Estado: pendiente (fix de una linea, condicionado a reproducir el gesto)

## Contexto

`src/modules/notes/NoteRow.tsx`, linea 91:

```tsx
{...(props.sortable ? listeners : {})}
```

Los listeners de puntero de `dnd-kit` (`useSortable`) se atan a toda la fila
siempre que `props.sortable` es `true` (es decir, `config.sortMode === "custom"`,
ver `NoteListColumn.tsx`), incluida la fila que esta en modo de rename inline
(`props.editing`). El `activationConstraint: { distance: 4 }` del sensor
(`NoteListColumn.tsx`, `useSensors`) significa que un click-and-drag de 4px o mas
dentro del `<input>` de rename (por ejemplo, para seleccionar texto arrastrando el
raton) puede interpretarse como el inicio de un drag en vez de una seleccion de
texto. Requiere la combinacion exacta de sort mode `custom` mas ese gesto
concreto, por eso no es mas visible.

## Mejora propuesta

Excluir los listeners de drag mientras la fila esta en modo edicion:

```tsx
{...(props.sortable && !props.editing ? listeners : {})}
```

## Relacionado

- `src/modules/notes/NoteRow.tsx`
- `src/modules/notes/NoteListColumn.tsx` (define `sortable` y el sensor)
