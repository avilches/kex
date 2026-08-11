# IMP-NOTES-07: escenarios de la vista de notas pendientes de verificar en la app

Estado: pendiente

## Contexto

La vista de notas se mergeo en `main` (3eceb2b) tras una revision de rama completa y
cuatro rondas de arreglos, pero toda la evidencia de esas rondas venia de leer codigo
y de los tests: ningun agente pudo arrancar la aplicacion. El usuario probo la feature
a mano despues del merge y reporto que funciona, cubriendo estos casos:

- Borrar o renombrar una nota con cambios sin guardar: **falla como se predijo**, el
  fichero se recrea. Ver [BUG-53](../bugs/BUG-53-autosave-flush-resucita-fichero-borrado-o-renombrado.md),
  ya confirmado en la app.
- Una carpeta con punto en el nombre (`docs/v1.2`) creada desde fuera aparece sola en el
  arbol, sin pulsar refresco. Correcto: era el caso que se escapo en la tercera ronda.
- Pereza: con un workspace con raiz definida y sin abrir nunca la pestaña de notas, no se
  crea ningun `kex.json` ni se lanza ningun `notes_list`.

Quedan cuatro escenarios sin ejercitar. Se registran porque no son hipotesis: son los
caminos donde un arreglo concreto de este trabajo no ha sido observado funcionando.

## Lo que falta probar

### 1. Borrado con cambio de workspace de por medio (prioridad)

Este es el que guarda el arreglo del bug **critico** de la revision final: antes,
confirmar el borrado tras cambiar de workspace borraba permanentemente un fichero del
vault equivocado, porque la ruta guardada era relativa y se recomponia contra la raiz
del momento de confirmar.

Pasos: abrir la confirmacion de borrado de una nota en el workspace A, cambiar al
workspace B con Mod+Alt+Flecha sin cerrar el dialogo, y confirmar. Debe borrarse la nota
de A, la que se pidio. El arreglo esta en `src/modules/notes/NotesView.tsx`, en el efecto
de reset con deps `[props.active, canonRoot]`, que limpia `pendingDelete`,
`editingFolder` y `primedRenamePath` en cuanto cambia la raiz.

Nota: el mismo patron sigue vivo y **sin arreglar** en el panel de git, ver
[BUG-54](../bugs/BUG-54-discard-confirma-contra-el-repo-equivocado.md). Al probar este
caso conviene probar tambien el de BUG-54, que es perdida de datos irrecuperable.

### 2. Orden personalizado con una carpeta filtrada

Guarda el arreglo de un Important de la revision: un arrastre con filtro de carpeta
activo reemplazaba el mapa de orden completo por solo las filas visibles, borrando el
orden del resto del vault en `kex.json`.

Pasos: poner el orden en Custom, arrastrar notas para ordenar todo el vault, seleccionar
una subcarpeta, arrastrar una fila dentro, y volver a "All notes". El orden de las notas
de fuera del filtro debe estar intacto. La logica esta en `mergeNoteOrder`
(`src/modules/notes/lib/noteSort.ts`) y tiene cuatro tests, pero nunca se ha visto en la
app.

### 3. Coste con la vista oculta en un repo grande

Guarda los arreglos de "refresh economics": la propia escritura de `kex.json` disparaba
un recorrido completo del vault en cada cambio de interfaz, y los escuchadores no se
desuscribian nunca una vez armados, asi que una vista invisible seguia recorriendo el
vault el resto de la sesion.

Pasos: abrir las notas en un repo grande, cambiar a Explorer o Git, y trabajar un rato
con el editor guardando ficheros. No deberia haber tirones ni actividad de indexado; al
volver a la pestaña de notas se hace un unico recorrido.

### 4. `kex.json` con contenido ajeno o corrupto

Pasos: añadir una clave de primer nivel inventada al `kex.json` de la raiz, tocar algo en
la vista de notas, y confirmar que la clave sobrevive (la escritura es
read-modify-write). Luego romper el JSON a proposito y confirmar que la vista arranca con
valores por defecto y **no** sobrescribe el fichero hasta la primera mutacion del usuario.

## Relacionado

- El equivalente para el editor rich: [IMP-MD-01](IMP-MD-01-verificacion-manual-editor-rich.md).
