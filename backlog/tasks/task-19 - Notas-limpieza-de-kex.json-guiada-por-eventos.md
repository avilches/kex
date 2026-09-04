---
id: TASK-19
title: 'Notas: limpieza de kex.json guiada por eventos'
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: low
type: idea
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hoy la reparacion del namespace notes de kex.json corre al activar la vista: una llamada a notes_paths_exist con todas las rutas que el fichero recuerda, y a partir de ahi solo se repara lo que se toca desde dentro de Kex (borrar o renombrar una nota actualiza la configuracion en la misma operacion).

La idea: aprovechar informacion que ya llega. Cada respuesta de notes_read_dirs dice exactamente que notas y que subcarpetas hay dentro de la carpeta leida, asi que se puede limpiar la configuracion de esa carpeta sin una sola llamada extra. Es estrictamente mejor que un temporizador periodico, que se descarto por dos razones: pagaria una tanda de comprobaciones al sistema de ficheros para arreglar algo que nadie esta viendo, y kex.json vive en el repositorio del usuario, asi que escribirlo en un momento cualquiera le ensucia el arbol de git mientras hace otra cosa.

Lo que no cubre: solo sirve para las carpetas cargadas. Para las que no lo estan sigue haciendo falta la pasada al activar la vista, asi que esto se suma a lo que hay, no lo sustituye.

Solo merece la pena si algun dia se nota que un kex.json se queda sucio demasiado tiempo.
<!-- SECTION:DESCRIPTION:END -->
