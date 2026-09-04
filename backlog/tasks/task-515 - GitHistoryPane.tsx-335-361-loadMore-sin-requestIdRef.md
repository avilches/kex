---
id: TASK-515
title: 'GitHistoryPane.tsx:335-361 - loadMore sin requestIdRef'
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
ordinal: 515000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. loadMore no comprueba requestIdRef (a diferencia de loadInitial): una pagina obsoleta puede mergearse tras un retry o cambio de repoRoot, creando huecos en el grafo o un endReached=true erroneo.
<!-- SECTION:DESCRIPTION:END -->
