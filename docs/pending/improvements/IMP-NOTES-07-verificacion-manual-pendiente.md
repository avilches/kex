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

Quedan cuatro grupos de escenarios sin ejercitar. Se registran porque no son hipotesis: son
los caminos donde un arreglo concreto de este trabajo no ha sido observado funcionando. El
cuarto grupo lo aporta el trabajo posterior de scoping por carpeta.

Antes habia un cuarto escenario (orden personalizado con una carpeta filtrada), que se
retiro de esta lista: guardaba el arreglo de `mergeNoteOrder`, funcion que se elimino al
pasar el orden custom a ser por carpeta. Sin un mapa de orden compartido entre carpetas,
ya no existe nada que un arrastre con filtro de carpeta pueda danar.

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

### 2. Coste con la vista oculta en un repo grande

Guarda los arreglos de "refresh economics": la propia escritura de `kex.json` disparaba
un recorrido completo del vault en cada cambio de interfaz, y los escuchadores no se
desuscribian nunca una vez armados, asi que una vista invisible seguia recorriendo el
vault el resto de la sesion.

Pasos: abrir las notas en un repo grande, cambiar a Explorer o Git, y trabajar un rato
con el editor guardando ficheros. No deberia haber tirones ni actividad de indexado; al
volver a la pestaña de notas se hace un unico recorrido.

### 3. `kex.json` con contenido ajeno o corrupto

Pasos: añadir una clave de primer nivel inventada al `kex.json` de la raiz, tocar algo en
la vista de notas, y confirmar que la clave sobrevive (la escritura es
read-modify-write). Luego romper el JSON a proposito y confirmar que la vista arranca con
valores por defecto y **no** sobrescribe el fichero hasta la primera mutacion del usuario.

### 4. Scoping por carpeta: el recorrido completo de la feature nueva

Siete escenarios del trabajo que hizo la lista mostrar una sola carpeta. Ningun agente pudo
arrancar la aplicacion, y no hay infraestructura de tests de componentes en el repo, asi que
esta es la unica cobertura de la capa React de esa feature. Los dos primeros son los que
guardan arreglos de la revision final de rama, o sea los que mas importan.

1. Crear una nota desde el menu contextual de una carpeta que **no** es la seleccionada. Debe
   saltar a esa carpeta y abrir el rename en linea de la nota nueva. Antes del arreglo creaba
   un `Untitled.md` sin forma de nombrarlo.
2. Crear una carpeta dentro de una carpeta **sin hijos**. Debe expandir la carpeta padre y abrir
   el rename en linea de la nueva. Antes del arreglo aparecia en disco como `New Folder` sin
   ningun aviso.
3. El arbol abre entero colapsado. Expandir `docs`, cerrar la app, reabrir: solo `docs` sigue
   expandido.
4. Seleccionar `docs`: arriba salen sus subcarpetas con su cuenta de notas directas, debajo solo
   las notas que estan directamente en `docs`. Pulsar una subcarpeta entra en ella y el arbol se
   expande para dejarla visible y seleccionada.
5. La fila raiz lleva el nombre de la carpeta del workspace y muestra solo las notas de la raiz
   mas las carpetas de primer nivel.
6. Poner el orden en Custom, arrastrar dos notas de `docs`, ir a otra carpeta y volver: el orden
   se mantiene. En `kex.json`, `folderOrder` tiene una entrada para `docs` con nombres de
   fichero, no rutas. Cambiar a Modified y volver a Custom: el orden sigue ahi.
7. Con la app cerrada, borrar una carpeta que tuviera entrada de orden y estuviera expandida.
   Reabrir y entrar en notas: la entrada y la expansion desaparecen de `kex.json`, y si esa
   carpeta estaba seleccionada la lista vuelve a la raiz. Con la agrupacion por fecha activada,
   las filas de carpeta salen por encima de la primera cabecera de fecha.

## Relacionado

- El equivalente para el editor rich: [IMP-MD-01](IMP-MD-01-verificacion-manual-editor-rich.md).
- Los minors aceptados de la misma feature: [IMP-NOTES-08](IMP-NOTES-08-minors-del-scoping-por-carpeta.md).
