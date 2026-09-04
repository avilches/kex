---
id: TASK-563
title: 'terminalLinks.ts:5-19 - pathExistsCache sin cota ni invalidacion'
status: To Do
assignee: []
created_date: '2026-09-04 01:24'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 563000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 4, Memory/resource leaks, MEDIA. Crece con cada ruta unica vista y cachea true para siempre (ficheros borrados siguen generando enlaces). Fix: LRU con TTL.
<!-- SECTION:DESCRIPTION:END -->
