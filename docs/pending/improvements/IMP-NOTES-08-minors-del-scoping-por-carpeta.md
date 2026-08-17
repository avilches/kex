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

## Items

1. **Un rename con barra mueve la nota y pierde su posicion en el orden custom.**
   `src/modules/notes/lib/notesConfig.ts`, `renamePathInConfig`: cuando el directorio de
   origen y el de destino difieren, el nombre se quita de la lista de la carpeta de origen y
   no se inserta en la de destino, asi que la nota cae al final por fecha. Se llega
   escribiendo una barra en el input de rename de una nota, que hace que `handleRename`
   construya una ruta en otro directorio. Es una posicion perdida, no un fichero perdido.
   Durante la ejecucion se dio por inalcanzable y la revision final demostro que no lo es.

2. **Al arrastrar con el vault truncado se pierden las entradas de orden que no se ven.**
   `NoteListColumn.tsx` persiste exactamente las filas en pantalla, asi que si
   `index.truncated` es cierto y las notas de esa carpeta se cortaron en el tope de 50.000
   entradas, los nombres ya ordenados que no se renderizaron desaparecen de `folderOrder`. La
   funcion `mergeNoteOrder`, ya borrada, conservaba lo que no se veia.

3. **La primera poda puede llegar antes de que se lea `kex.json`.** Si el recorrido del vault
   resuelve antes que la lectura del fichero, la poda corre contra los valores por defecto y
   no hace nada, asi que las entradas muertas sobreviven hasta el siguiente evento de sistema
   de ficheros o refresco manual. Nunca borra de mas. Meter `config` en las dependencias del
   efecto no puede provocar un bucle, porque la salida de la poda es un punto fijo; el coste
   real seria una pasada redundante por cada cambio de config, asi que si algun dia interesa,
   la via es una bandera de "config cargada".

4. **Una carpeta viva pero invisible al recorrido pierde su estado.** El walker respeta
   `.gitignore` y salta directorios ocultos, asi que una carpeta que sigue en disco pero acaba
   de entrar en `.gitignore` es indistinguible de una borrada y su orden, expansion y seleccion
   se podan. Aceptado en el spec y ya documentado en `docs/FORK.md`.

5. **`expandFolder` no se protege sola de la clave raiz.** `src/modules/notes/lib/useNotesState.ts`:
   la guarda `parent !== ""` vive en el unico sitio que la llama, no dentro de la accion. Un
   segundo llamante podria insertar la clave de la raiz en `expandedFolders`, que la poda
   quitaria en el siguiente recorrido completo.

6. **El boton "+" de la lista vuelve a expandir ancestros colapsados a mano.** Efecto
   secundario del arreglo que selecciona la carpeta destino antes de crear la nota: si estas
   viendo `docs/pending` y habias colapsado `docs` a mano, pulsar "+" lo vuelve a expandir.

7. **La validacion de rutas de `kex.json` descarta nombres legales exoticos.** El predicado
   `isSafeVaultPath` rechaza barra invertida y rutas absolutas, asi que un fichero de macOS con
   una barra invertida literal en el nombre, o uno llamado `a:b.md`, se caen silenciosamente de
   `quickAccess`. Son nombres legales en macOS y en Linux.

8. **Cosmeticos.** `noteSort.ts` linea 28 dispara `useIterableCallbackReturn` de biome porque
   el cuerpo conciso del `forEach` devuelve el valor de `Map.set`; se arregla con llaves o un
   `for..of`. `useNotesState.ts` linea 154 tiene 81 columnas y biome quiere partirla, siendo
   `lineWidth: 80`. `NoteListColumn` sigue recibiendo `quickAccess` cuando `config` ya lo trae
   (preexistente). `update` llama a `scheduleWrite` dentro del updater de `setConfig`, un efecto
   secundario en un reducer que solo el debounce de 300ms hace inocuo (preexistente).

## Relacionado

- `src/modules/notes/lib/notesConfig.ts`, `src/modules/notes/lib/useNotesState.ts`,
  `src/modules/notes/NoteListColumn.tsx`
- Verificacion manual pendiente de esta misma feature:
  [IMP-NOTES-07](IMP-NOTES-07-verificacion-manual-pendiente.md)
- El fichero `biome.json` con `lineWidth: 80` frente a un codebase escrito mas ancho es una
  decision de proyecto sin tomar, no un item de esta feature.
