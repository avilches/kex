---
id: TASK-537
title: Mensajes de modales destructivos (source-control y otros)
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels: []
dependencies: []
references:
  - docs/pending/MODAL_MESSAGES.md
priority: medium
type: task
ordinal: 537000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mejora de UX: afinar los textos de los modales destructivos (empezando por discard changes en source-control), dar feedback de resultado tras la accion, y revisar los iconos de los botones de accion para que comuniquen si una accion es reversible o destructiva. No programado todavia: quedan decisiones de alcance y tono por cerrar antes de implementar.

Decisiones (tres ejes separados):
1. Afinar textos de modales existentes: acordado. Cada modal/caso lleva su propia string literal escrita a mano; lo unico dinamico es el nombre del fichero (o el basename en resultados) y numeros. Nada de funciones que compongan frases automaticamente.
2. Anadir modales nuevos: decision aparte, caso por caso. No entra en el lote de afinar. Unico candidato real: borrar tema personalizado (ThemesSection.tsx, boton x) que hoy se ejecuta sin confirmacion. Pendiente decidir si lleva confirm.
3. Mensaje de resultado: hoy no existe para ninguna accion destructiva. Hay que decidir alcance y canal.

Hallazgos del codigo:
- No hay modal de unstage ni mensaje de resultado para unstage. git unstage (reset) no toca el working tree, asi que cualquier copy de unstage debe describir el estado resultante, no insinuar cambios en disco.
- Discard solo actua sobre entradas no staged (grupo Changes). Las entradas staged no tienen discard.
- Discard tiene discard all ademas del de un fichero: boton Discard all changes en SourceControlPanel.tsx llama a scm.requestDiscardAll; requestDiscardAll (useSourceControlPanel.ts) siembra pendingDiscard con scope all y todas las unstagedEntries; se manda en una sola llamada a native.gitDiscard.
- Efecto real del discard (backend operations.rs): solo se bifurca por untracked. tracked llama a git restore --worktree (revierte/restaura desde el index). untracked llama a git clean -f -d (borra del disco, irreversible). Traducido a los 3 casos de la UI: Modificado (M) revierte ediciones; Borrado (D) restaura el fichero (NO se pierde nada); Untracked borra del disco.
- El texto actual del modal miente: dice cannot be undone para todos, pero en el caso D (restore) no se pierde nada. El cant be undone debe aparecer solo donde hay perdida real (M, untracked, discard all, delete permanente, reset, delete theme).
- Datos disponibles al confirmar: el frontend tiene el SourceControlEntry completo en pendingDiscard.entry (statusCode, untracked, etc.), aunque al backend solo se le pasa path mas untracked (tipo GitDiscardEntry). Suficiente para ramificar el copy por caso.
- Canales de feedback (NO uniforme): source-control usa un banner inline propio, no toast (actionMessage/actionError en SourceControlPanel.tsx). De exito solo lo usan commit y push. Discard nunca pone mensaje de exito (runMutation solo limpia a null). Explorer/editor usan toast (sonner) solo para errores; el unico toast de exito de toda la app es el autosave del editor. Reset shortcuts y delete theme: sin feedback alguno.
- Inventario de modales destructivos: explorer delete/trash (DeleteEntryModal.tsx), discard (SourceControlPanel.tsx), close dialogs (CloseDialogs.tsx: fichero sucio, terminal con proceso, fichero borrado externamente, ya bien afinados), reset all shortcuts (ShortcutsSection.tsx), delete custom theme (sin confirm).

Iconos de los botones de accion (stage / unstage / discard): el boton menos no significa lo mismo en cada grupo. Quitar del stage (unstage) NO pierde nada (solo mueve la entrada de Staged a Changes); en cambio el boton de Changes ejecuta un discard, que en untracked borra del disco. Estado actual: Staged a Unstage (reversible) usa MinusSignIcon; Changes a Discard (destructivo) usa RemoveSquareIcon; Changes a Stage (reversible) usa PlusSignIcon. Ya hay dos iconos distintos pero la diferencia es sutil. Revisar cuando se programe: iconos que comuniquen mejor el riesgo (papelera o peligro para discard, flecha de devolver para unstage), consistencia entre header, carpeta y fila, color o tinte distinto para la accion destructiva, decidir junto con los textos del modal.

Strings propuestas (base, sujetas a retoque de tono):
- Discard M: titulo Discard changes / descripcion Your edits to this file will be lost. This cant be undone. / boton Discard / resultado Discarded changes in the file.
- Discard D: titulo Restore deleted file / descripcion The file will be brought back from the last commit. / boton Restore / resultado Restored the file.
- Discard untracked: titulo Delete untracked file / descripcion The file is not tracked by git. It will be removed from disk. This cant be undone. / boton Delete / resultado Deleted the file.
- Discard all: titulo Discard all changes / descripcion All the changes in the working tree will be discarded, including deleted and new files. This cant be undone. / boton Discard all / resultado Discarded all changes.
- Resultados que faltan (confirm ya correcto): Explorer permanente Deleted the file.; Explorer papelera Moved the file to trash.; Reset all shortcuts All shortcuts reset to defaults.
- Delete tema (solo si se decide anadir confirm): titulo Delete theme / descripcion The theme will be permanently deleted. This cant be undone. / boton Delete / resultado Deleted the theme.
- Criterios: cant be undone solo donde hay perdida real (no en el caso D). En resultados usar basename; en descripciones del modal se puede usar ruta completa entre comillas.

Pasos cuando se programe:
1. Confirmar alcance del mensaje de resultado: solo discard (banner), o tambien explorer delete (toast) y reset shortcuts.
2. Decidir si delete de tema lleva confirm nuevo.
3. Validar y retocar el tono de las strings.
4. Implementar: discard ramificando titulo y descripcion del AlertDialog y seteando actionMessage de exito por caso en confirmPendingDiscard/runMutation, usando entry.statusCode y entry.untracked (discard all con el total); explorer delete/trash con toast.success tras deletePath/trashPath en useFileTree.ts; reset shortcuts con feedback en ShortcutsSection.tsx.
<!-- SECTION:DESCRIPTION:END -->
