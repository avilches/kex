---
id: TASK-707
title: >-
  useSourceControl.ts:510-531 - cada evento fs dispara git status completo y el
  snapshot es siempre un objeto nuevo, re-renderiza la lista virtualizada entera
status: To Do
assignee: []
created_date: '2026-09-04 01:33'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: task
ordinal: 700000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 9, Optimizaciones, MEDIA. src/modules/source-control/useSourceControl.ts:510-531 - Cada evento fs dispara un status completo y el snapshot es siempre un objeto nuevo: se re-renderiza la lista virtualizada entera aunque nada cambie. Comparacion estructural barata antes del setState.
<!-- SECTION:DESCRIPTION:END -->
