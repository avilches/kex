---
id: TASK-9
title: 'Updater: dialogo demasiado agresivo, no se puede saltar'
status: To Do
assignee: []
created_date: '2026-09-04 01:20'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: medium
type: idea
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: idea anotada (2026-06-14).

El dialogo de actualizacion ocupa toda la pantalla y no ofrece una opcion de "saltar hasta la siguiente version". Es demasiado invasivo. El modelo ideal es el de cmux: un banner o pill discreto en la parte inferior de la ventana que avisa de la nueva version, permite instalarla o saltarsela hasta la siguiente, y no bloquea el flujo de trabajo.

Modulo implicado: src/modules/updater/. Revisar si tauri-plugin-updater expone una forma de postponer o ignorar una version concreta, y almacenar la version ignorada en el store de settings para no volver a molestar hasta la siguiente.
<!-- SECTION:DESCRIPTION:END -->
