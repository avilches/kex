---
id: TASK-529
title: 'rendererPool.ts:731-740 - retry de onContextLoss no se cancela'
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
ordinal: 529000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, BAJA. El retry de onContextLoss no se cancela y puede ejecutar attachWebgl sobre un slot ya disposed.
<!-- SECTION:DESCRIPTION:END -->
