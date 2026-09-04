---
id: TASK-520
title: >-
  validateTheme.ts:22 - radius se valida con CSS.supports color, rechaza temas
  builtin
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 520000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. radius esta en COLOR_KEYS y se valida con CSS.supports("color", ...), que falla para "0.5rem": cualquier tema con radius es rechazado. Cuatro temas builtin lo usan; un usuario que parta de ellos no puede importar ni guardar su tema custom. Fix: validar con CSS.supports("border-radius", v).
<!-- SECTION:DESCRIPTION:END -->
