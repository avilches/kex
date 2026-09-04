---
id: TASK-609
title: >-
  BUG-39: Busqueda de ficheros: UX poco clara (no es bug de codigo, falta
  descubribilidad)
status: To Do
assignee: []
created_date: '2026-09-04 01:30'
labels: []
dependencies: []
references:
  - docs/pending/bugs/BUG-39-file-search-ux-poco-clara.md
priority: low
type: bug
ordinal: 602000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
---
id: BUG-39
title: Busqueda de ficheros: UX poco clara (solo via Cmd+P + #?)
area: explorer / search
severity: low
---

## Descripcion

El flujo para buscar ficheros por nombre o contenido no es evidente para el usuario. Al parecer solo se puede acceder via `Cmd+P` y luego usando `#` como prefijo, pero esto no esta documentado en la UI ni hay una forma alternativa obvia de descubrirlo.

## Preguntas abiertas

- Cual es el flujo correcto hoy? `Cmd+P` abre el quick-open, y `#` redirige a busqueda de contenido? O es al reves?
- Hay un atajo directo para busqueda de contenido (grep) sin pasar por quick-open?
- La busqueda desde el explorer (icono de lupa o similar) existe?

## Impacto

Un usuario nuevo no sabe como buscar ficheros o contenido. Falta de descubribilidad.

## Mejora deseada

Clarificar el modelo mental y hacerlo mas descubrible:
- Documentar el flujo en algun tooltip / placeholder del quick-open.
- Valorar si la busqueda de contenido merece su propio atajo directo (p. ej. `Cmd+Shift+F`).
- El panel del explorer podria tener un boton de busqueda visible.
<!-- SECTION:DESCRIPTION:END -->
