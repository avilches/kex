# Mensajes de modales destructivos (source-control y otros)

Mejora de UX: afinar los textos de los modales destructivos (empezando por **discard changes** en
source-control), dar feedback de resultado tras la accion, y revisar los **iconos de los botones de accion**
para que comuniquen si una accion es reversible o destructiva (ver seccion "Iconos de los botones de accion").
No programado todavia: quedan decisiones de alcance y tono por cerrar antes de implementar.

## Decisiones (tres ejes separados)

1. **Afinar textos de modales existentes**: acordado. Cada modal/caso lleva su propia string literal escrita
   a mano; lo unico dinamico es `${name}` (o el `basename` en resultados) y numeros. Nada de funciones que
   compongan frases automaticamente.
2. **Anadir modales nuevos**: decision aparte, caso por caso. No entra en el lote de "afinar". Unico
   candidato real: borrar tema personalizado (`ThemesSection.tsx`, boton `x`) que hoy se ejecuta sin
   confirmacion. Pendiente decidir si lleva confirm.
3. **Mensaje de resultado**: hoy no existe para ninguna accion destructiva. Hay que decidir alcance y canal
   (ver Hallazgos).

## Hallazgos del codigo

- **No hay modal de unstage** ni mensaje de resultado para unstage. `git unstage` (reset) no toca el working
  tree, asi que cualquier copy de unstage debe describir el estado resultante, no insinuar cambios en disco.
- **Discard solo actua sobre entradas no staged** (grupo "Changes"). Las entradas staged no tienen discard.
- **Discard tiene "discard all"** ademas del de un fichero:
  - Boton "Discard all changes" en `SourceControlPanel.tsx:977` -> `scm.requestDiscardAll`.
  - `requestDiscardAll` (`useSourceControlPanel.ts:513-516`) siembra `pendingDiscard` con `scope:"all"` y
    todas las `unstagedEntries`; se manda en una sola llamada a `native.gitDiscard`.
- **Efecto real del discard (backend `operations.rs:342-394`)**: solo se bifurca por `untracked`.
  - tracked -> `git restore --worktree` (revierte/restaura desde el index).
  - untracked -> `git clean -f -d` (borra del disco, irreversible).
  - Traducido a los 3 casos de la UI: Modificado (`M`) = revierte ediciones; Borrado (`D`) = restaura el
    fichero (NO se pierde nada); Untracked = borra del disco.
- **El texto actual del modal miente**: dice "cannot be undone" para todos, pero en el caso `D` (restore) no
  se pierde nada. El `"can't be undone"` debe aparecer solo donde hay perdida real (M, untracked, discard
  all, delete permanente, reset, delete theme).
- **Datos disponibles al confirmar**: el frontend tiene el `SourceControlEntry` completo en
  `pendingDiscard.entry` (`statusCode`, `untracked`, etc.), aunque al backend solo se le pasa
  `{path, untracked}` (`GitDiscardEntry`). Suficiente para ramificar el copy por caso.
- **Canales de feedback (NO uniforme):**
  - Source-control usa un **banner inline propio**, no toast: `actionMessage`/`actionError` renderizado en
    `SourceControlPanel.tsx:222-229`. De exito solo lo usan commit (`useSourceControlPanel.ts:575`) y push
    (`:593`). Discard nunca pone mensaje de exito (`runMutation` solo limpia a `null` en `:456`).
  - Explorer/editor usan **toast (sonner)**: `useFileTree.ts`, `useExplorerFileDrop.ts` solo para errores; el
    unico toast de exito de toda la app es el autosave del editor (`useDocument.ts`).
  - Reset shortcuts y delete theme: sin feedback alguno.
- Inventario de modales destructivos: explorer delete/trash (`DeleteEntryModal.tsx`), discard
  (`SourceControlPanel.tsx:770-796`), close dialogs (`CloseDialogs.tsx`: fichero sucio / terminal con proceso
  / fichero borrado externamente, ya bien afinados), reset all shortcuts (`ShortcutsSection.tsx:156-174`),
  delete custom theme (sin confirm).

## Iconos de los botones de accion (stage / unstage / discard)

Problema de UX senalado: el boton "-" no significa lo mismo en cada grupo y eso confunde. Quitar del stage
(unstage) NO pierde nada (solo mueve la entrada de "Staged" a "Changes"); en cambio el boton de "Changes"
ejecuta un discard, que en untracked borra del disco. El usuario debe poder distinguir de un vistazo la
accion reversible de la destructiva.

Estado actual del codigo (`SourceControlPanel.tsx`):

- **Staged -> Unstage** (reversible): `MinusSignIcon` (`-`). Aparece en el header "Unstage all" (`:1164`),
  en carpeta "Unstage folder" (`:1286`) y en la fila "Unstage ${path}" (`:1429`).
- **Changes -> Discard** (destructivo): `RemoveSquareIcon`. Header/"Discard all", carpeta "Discard folder
  changes" (`:1295`) y fila "Discard ${path}" (`:1446`).
- **Changes -> Stage** (reversible): `PlusSignIcon` (`+`).

O sea, ya hay dos iconos distintos (MinusSign vs RemoveSquare), pero la diferencia es sutil y no lee como
"reversible vs irreversible". Cosas a revisar cuando se programe:

- Elegir iconos que comuniquen mejor el riesgo: el discard destructivo podria usar un icono de papelera o de
  peligro en lugar de un cuadrado; el unstage reversible podria ser una flecha de "devolver"/"bajar" en vez
  de un simple `-`, para no colisionar conceptualmente con "quitar".
- Mantener consistencia entre los tres niveles (header / carpeta / fila) y con los iconos del explorer.
- Posible color/tinte distinto para la accion destructiva (hover en tono destructivo) sin recargar la fila.
- Decidir junto con los textos del modal (esta misma nota): icono + titulo + boton deben contar la misma
  historia por caso (M / D / untracked / discard all).

## Strings propuestas (base, sujetas a retoque de tono)

Discard de un fichero (titulo/descripcion segun `entry.statusCode` / `entry.untracked`):

- Modificado (`M`): titulo `Discard changes?` / desc `Your edits to "${name}" will be lost. This can't be
  undone.` / boton `Discard` / resultado `Discarded changes in ${name}.`
- Borrado (`D`): titulo `Restore deleted file?` / desc `"${name}" will be brought back from the last commit.`
  / boton `Restore` / resultado `Restored ${name}.`
- Untracked: titulo `Delete untracked file?` / desc `"${name}" is not tracked by git. It will be removed from
  disk. This can't be undone.` / boton `Delete` / resultado `Deleted ${name}.`

Discard all:

- Titulo `Discard all changes?` / desc `All ${n} changes in the working tree will be discarded, including
  deleted and new files. This can't be undone.` / boton `Discard all` / resultado `Discarded ${n} changes.`

Resultados que faltan (confirm ya correcto):

- Explorer permanente: `Deleted ${name}.`
- Explorer papelera: `Moved ${name} to trash.`
- Reset all shortcuts: `All shortcuts reset to defaults.`

Delete tema (solo si se decide anadir confirm):

- Titulo `Delete theme?` / desc `"${name}" will be permanently deleted. This can't be undone.` / boton
  `Delete` / resultado `Deleted theme "${name}".`

Criterios: `"can't be undone"` solo donde hay perdida real (no en el caso `D`). En resultados usar `basename`;
en descripciones del modal se puede usar ruta completa entre comillas.

## Pasos cuando se programe

1. Confirmar alcance del mensaje de resultado: solo discard (banner), o tambien explorer delete (toast) y
   reset shortcuts.
2. Decidir si delete de tema lleva confirm nuevo.
3. Validar/retocar el tono de las strings.
4. Implementar:
   - Discard: ramificar titulo/desc del `AlertDialog` y setear `actionMessage` de exito por caso en
     `confirmPendingDiscard`/`runMutation`, usando `entry.statusCode`/`entry.untracked`. Discard all con `${n}`.
   - Explorer delete/trash: `toast.success` tras `deletePath`/`trashPath` en `useFileTree.ts`.
   - Reset shortcuts: feedback en `ShortcutsSection.tsx`.
