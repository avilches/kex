# IMP-NOTES-05: click simple y doble click se comportan igual al abrir una nota

Estado: pendiente (hereda una limitacion del modelo de tabs de `main`)

## Contexto

El spec original de la vista de notas prometia: "single click opens as preview
tab, double click pins, same convention as the explorer". En la practica,
`src/modules/workspaces/lib/types.ts` define el tab `editor` con un campo
`preview: boolean` (linea 24) pero el tab `markdown` no lo tiene (linea 26:
`{ kind: "markdown"; path: string; dirty?: boolean }`, sin `preview`). Como las
notas siempre se abren como tab `markdown` (`NotesView.tsx`, `props.onOpenFile`),
`openFileInTab` no tiene rama de reemplazo de preview para ellas, y tanto
`onOpen(relPath)` (click simple, `NoteRow.tsx` linea 97) como
`onOpen(relPath, true)` (doble click, linea 100) terminan haciendo exactamente lo
mismo: abrir/enfocar un tab normal. Cada nota clicada acumula un tab nuevo en vez
de reusar un tab de preview.

Esta limitacion viene heredada del modelo de tabs de `main`, no fue introducida
por esta feature, pero la promesa del spec no se cumple tal cual esta hoy.

## Mejora propuesta

Cualquier fix real pasa por dar a los tabs markdown un modo preview equivalente al
de los tabs editor (campo `preview` en el tipo, logica de reemplazo en
`openFileInTab`), y solo despues cablear `onOpen`/`onOpen(..., true)` en
`NoteRow.tsx` a esa semantica.

## Relacionado

- `src/modules/workspaces/lib/types.ts`
- `src/modules/notes/NoteRow.tsx`
- `src/modules/notes/NotesView.tsx`
- Logica de apertura de tabs (`openFileInTab` o equivalente en `useWorkspaces`)
