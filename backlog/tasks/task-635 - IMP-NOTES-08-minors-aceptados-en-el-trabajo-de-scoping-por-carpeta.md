---
id: TASK-635
title: 'IMP-NOTES-08: minors aceptados en el trabajo de scoping por carpeta'
status: To Do
assignee: []
created_date: '2026-09-04 01:30'
labels: []
dependencies: []
references:
  - docs/pending/improvements/IMP-NOTES-08-minors-del-scoping-por-carpeta.md
priority: low
type: task
ordinal: 628000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
# IMP-NOTES-08: minors aceptados en el trabajo de scoping por carpeta

Estado: pendiente

## Contexto

Cosecha de las nueve revisiones por tarea y de la revision final de rama del trabajo que
hizo la lista de notas mostrar una sola carpeta (spec
`docs/superpowers/specs/2026-08-11-notes-folder-scoping-design.md`, plan
`docs/superpowers/plans/2026-08-11-notes-folder-scoping.md`). Ninguno bloqueaba el merge y
todos se decidieron conscientemente. Se agrupan aqui para no perderlos.

Los tres hallazgos importantes de la revision final (rename inline que no aparecia al crear
nota o carpeta, y el pie de pagina del tope de escaneo que mentia) ya estan arreglados en la
rama; no figuran en esta lista.

El trabajo que hizo la lectura de notas perezosa por carpeta (spec
`docs/superpowers/specs/2026-08-18-notes-lazy-levels-design.md`) resolvio cuatro de los ocho
items que se habian aceptado aqui: el 2 y el 3 describian maquinaria que ya no existe
(`mergeNoteOrder` y el recorrido completo del vault), el 4 se arreglo porque la reparacion de
`kex.json` ahora pregunta al filesystem directamente por cada ruta en vez de compararla contra
un indice que el walker pudo no ver, y el 7 se arreglo en la misma tanda de trabajo. Los cuatro
se retiraron de esta lista; los que quedan se renumeraron.

## Items

1. **Un rename con barra mueve la nota y pierde su posicion en el orden custom.**
   `src/modules/notes/lib/notesConfig.ts`, `renamePathInConfig`: cuando el directorio de
   origen y el de destino difieren, el nombre se quita de la lista de la carpeta de origen y
   no se inserta en la de destino, asi que la nota cae al final por fecha. Se llega
   escribiendo una barra en el input de rename de una nota, que hace que `handleRename`
   construya una ruta en otro directorio. Es una posicion perdida, no un fichero perdido.
   Durante la ejecucion se dio por inalcanzable y la revision final demostro que no lo es.

2. **`expandFolder` no se protege sola de la clave raiz.** `src/modules/notes/lib/useNotesState.ts`:
   la guarda `parent !== ""` vive en el unico sitio que la llama, no dentro de la accion. Un
   segundo llamante podria insertar la clave de la raiz en `expandedFolders`, y ahi se
   quedaria: `pruneNotesConfig` da la raiz siempre por directorio, asi que la poda no la
   quita. La entrada es redundante, no danina, porque la raiz siempre se carga.

3. **El boton "+" de la lista vuelve a expandir ancestros colapsados a mano.** Efecto
   secundario del arreglo que selecciona la carpeta destino antes de crear la nota: si estas
   viendo `docs/pending` y habias colapsado `docs` a mano, pulsar "+" lo vuelve a expandir.

4. **Cosmeticos.** `noteSort.ts` linea 24 dispara `useIterableCallbackReturn` de biome porque
   el cuerpo conciso del `forEach` devuelve el valor de `Map.set`; se arregla con llaves o un
   `for..of`. `useNotesState.ts` tiene varias lineas (33, 44, 159, 184, 197) por encima de 80
   columnas y biome quiere partirlas, siendo `lineWidth: 80`. `NoteListColumn` sigue recibiendo
   `quickAccess` cuando `config` ya lo trae (preexistente). `update` llama a `scheduleWrite`
   dentro del updater de `setConfig`, un efecto secundario en un reducer que solo el debounce
   de 300ms hace inocuo (preexistente).

## Relacionado

- `src/modules/notes/lib/notesConfig.ts`, `src/modules/notes/lib/useNotesState.ts`,
  `src/modules/notes/NoteListColumn.tsx`
- Verificacion manual pendiente de esta misma feature:
  [IMP-NOTES-07](IMP-NOTES-07-verificacion-manual-pendiente.md)
- El fichero `biome.json` con `lineWidth: 80` frente a un codebase escrito mas ancho es una
  decision de proyecto sin tomar, no un item de esta feature.
<!-- SECTION:DESCRIPTION:END -->
