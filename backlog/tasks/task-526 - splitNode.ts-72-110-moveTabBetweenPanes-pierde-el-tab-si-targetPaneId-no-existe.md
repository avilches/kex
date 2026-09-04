---
id: TASK-526
title: >-
  splitNode.ts:72-110 - moveTabBetweenPanes pierde el tab si targetPaneId no
  existe
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: low
type: bug
ordinal: 526000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, BAJA. moveTabBetweenPanes pierde el tab si targetPaneId no existe (hoy todos los callers validan antes, pero es perdida de datos latente en la funcion pura). Fix: findPane al inicio y devolver tree intacto.
<!-- SECTION:DESCRIPTION:END -->
