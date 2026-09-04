---
id: TASK-651
title: 'M15: Em-dashes preexistentes en shortcuts.ts (barrido pendiente)'
status: To Do
assignee: []
created_date: '2026-09-04 01:30'
labels: []
dependencies: []
references:
  - docs/pending/improvements/M15-emdash-shortcuts-ts.md
priority: low
type: task
ordinal: 644000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
# M15 - Em-dashes preexistentes en shortcuts.ts (barrido pendiente)

**Prioridad:** Baja
**Esfuerzo:** Trivial

## Contexto

`src/modules/shortcuts/shortcuts.ts` tiene dos em-dashes (`—`) en comentarios, en las lineas ~362 y
~444, que violan la regla del proyecto de "no em-dash en ningun sitio" (`AGENTS.md`, seccion
Conventions). Encontrados durante la revision final del plan del editor markdown rich
(`docs/superpowers/plans/2026-07-06-rich-markdown-editor.md`), pero confirmados como preexistentes: no
los introdujo ese plan, no tienen relacion con el.

## Cambio propuesto

Sustituir los dos em-dashes por guion simple, coma, o reestructurar la frase, segun lo que quede mas
natural en cada comentario:

- Linea ~362: `// macOS — on other platforms...` -> `// macOS. On other platforms...` (o similar).
- Linea ~444: `// them — they don't have App-level handlers...` -> reformular sin em-dash.

## Prioridad y alcance

Baja prioridad: no afecta a comportamiento, solo estilo de comentario. Se recomienda no arreglarlo como
fix aislado, sino incluirlo en un barrido futuro de todo el proyecto (puede haber mas em-dashes sin
inventariar en otros ficheros fuera del alcance de esta revision, que solo cubrio el subsistema
markdown).

## Relacionado

Regla "no em-dash" en `AGENTS.md` (Conventions) y en la memoria global del usuario
(`feedback_no_emdash.md`).
<!-- SECTION:DESCRIPTION:END -->
