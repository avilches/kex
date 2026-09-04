---
id: TASK-664
title: >-
  useTerminalSession.ts - respawnSession, whenSessionReady y
  navigateFocusedBlocks sin consumidores
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
ordinal: 657000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 5, Codigo muerto, Maquinaria muerta dentro de modulos vivos, MEDIA. src/modules/terminal/lib/useTerminalSession.ts - respawnSession (874-918, contiene carreras conocidas), whenSessionReady (141-172, con toda la maquinaria readyLeaves/readyWaiters/markSessionReady que solo existe para servirlo) y navigateFocusedBlocks (444-450): cero consumidores.
<!-- SECTION:DESCRIPTION:END -->
