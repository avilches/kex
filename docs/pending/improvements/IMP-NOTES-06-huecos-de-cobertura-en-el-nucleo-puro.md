# IMP-NOTES-06: dos huecos de cobertura en el nucleo puro de notas

Estado: pendiente

## Contexto

El nucleo puro del modulo de notas (`src/modules/notes/lib/`) esta bien cubierto en
general (`notesConfig.test.ts`, `noteSort.test.ts`), pero la revision final de la rama
identifico tres caminos que eran correctos por inspeccion y que ningun test ejercitaba.
Los tres se aceptaron como no bloqueantes para el merge; se registran aqui para no
perderlos.

El trabajo que hizo la lectura de notas perezosa por carpeta (spec
`docs/superpowers/specs/2026-08-18-notes-lazy-levels-design.md`) borro `folderTree.ts` y
`buildFolderTree`: el arbol de carpetas ahora se construye en `CollectionsColumn.tsx` a
partir de la cache por carpeta (`Map<string, NotesDir>`), y cada nivel de subcarpetas ya
llega ordenado desde Rust (`notes.rs`, `subfolders.sort_by_key`). El tercer hueco
(orden de hermanos anidados) describia una funcion que ya no existe, asi que se retira
de esta lista.

Ninguno de los dos que quedan es un bug conocido: son invariantes sin fijar, que es
justo lo que hace que un refactor futuro los pueda romper en silencio.

## Los dos huecos

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

## Por que merece un test y no solo confianza

`mergeNoteOrder` (la aritmetica de indices del orden personalizado) empezo tambien
como codigo "correcto por inspeccion" dentro de un componente, y la revision pidio
extraerlo al nucleo puro y cubrirlo precisamente porque un error silencioso ahi
corrompe datos persistidos del usuario en `kex.json`. Los dos huecos de arriba son de
menor impacto (afectan al orden mostrado, no a datos en disco), pero la logica es la
misma: son funciones puras, el test es de tres lineas, y el coste de que se rompan sin
avisar es mayor que el coste de fijarlas.

## Fix sugerido

Dos casos nuevos en `noteSort.test.ts`, sin tocar codigo de produccion:

- Un caso de `modified` y uno de `created` con timestamps iguales.
- Un caso de `groupNotesByDate` con la secuencia Hoy / Ayer / Hoy que afirme tres
  grupos.
