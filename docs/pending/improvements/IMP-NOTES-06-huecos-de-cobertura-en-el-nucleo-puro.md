# IMP-NOTES-06: tres huecos de cobertura en el nucleo puro de notas

Estado: pendiente

## Contexto

El nucleo puro del modulo de notas (`src/modules/notes/lib/`) esta bien cubierto en
general (`notesConfig.test.ts`, `noteSort.test.ts`, `folderTree.test.ts`,
`useNotesIndex.test.ts`), pero la revision final de la rama identifico tres caminos
que son correctos por inspeccion y que ningun test ejercita. Los tres se aceptaron
como no bloqueantes para el merge; se registran aqui para no perderlos.

Ninguno es un bug conocido: son invariantes sin fijar, que es justo lo que hace que
un refactor futuro los pueda romper en silencio.

## Los tres huecos

1. **Desempate por `relPath` cuando dos notas comparten timestamp.**
   `sortNotes` en `src/modules/notes/lib/noteSort.ts` desempata con
   `a.relPath.localeCompare(b.relPath)` en los modos `modified` y `created`. Los tests
   de esos dos modos en `noteSort.test.ts` usan timestamps todos distintos, asi que la
   rama del desempate nunca se ejecuta. Falta un caso con dos notas de `mtime` (y otro
   de `created`) identicos que compruebe que salen en orden alfabetico estable.

2. **Buckets de fecha no consecutivos.**
   `groupNotesByDate` solo fusiona rachas adyacentes del mismo bucket: mira unicamente
   `groups[groups.length - 1]`. Con una secuencia Hoy, Ayer, Hoy debe producir tres
   grupos, no dos fusionados. Correcto por inspeccion, sin test. Relacionado: los tests
   actuales fijan una hora de referencia, asi que el comportamiento real alrededor de la
   medianoche local tampoco esta cubierto (eso ya figura en la lista de verificacion
   manual del plan).

3. **Orden de hermanos anidados en el arbol de carpetas.**
   `buildFolderTree` en `src/modules/notes/lib/folderTree.ts` ordena una sola vez de
   forma global e insensible a mayusculas, y de ahi se deduce que los hermanos quedan
   ordenados a cualquier profundidad. `folderTree.test.ts` solo lo comprueba en la raiz;
   el orden de los hijos de un nodo anidado se infiere del algoritmo, no se afirma.

## Por que merece un test y no solo confianza

`mergeNoteOrder` (la aritmetica de indices del orden personalizado) empezo tambien
como codigo "correcto por inspeccion" dentro de un componente, y la revision pidio
extraerlo al nucleo puro y cubrirlo precisamente porque un error silencioso ahi
corrompe datos persistidos del usuario en `kex.json`. Los tres huecos de arriba son de
menor impacto (afectan al orden mostrado, no a datos en disco), pero la logica es la
misma: son funciones puras, el test es de tres lineas, y el coste de que se rompan sin
avisar es mayor que el coste de fijarlas.

## Fix sugerido

Tres casos nuevos en los ficheros de test que ya existen, sin tocar codigo de
produccion:

- `noteSort.test.ts`: un caso de `modified` y uno de `created` con timestamps iguales.
- `noteSort.test.ts`: un caso de `groupNotesByDate` con la secuencia Hoy / Ayer / Hoy
  que afirme tres grupos.
- `folderTree.test.ts`: afirmar el orden de los hijos de un nodo anidado, no solo el de
  la raiz.
