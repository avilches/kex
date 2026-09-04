---
id: TASK-684
title: >-
  Buscar editor/markdown ya abierto con un path implementado tres veces; close
  others/all con dos rutas distintas
status: To Do
assignee: []
created_date: '2026-09-04 01:33'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: low
type: task
ordinal: 677000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 6, Codigo duplicado, BAJA. "Buscar editor/markdown ya abierto con este path" implementado tres veces (App.tsx:1033,1099, WorkspaceDndProvider.tsx:234); "close others/all" con dos rutas (App.tsx:2021 filtra a mano, PaneView.tsx:244 usa isBulkClosable).
<!-- SECTION:DESCRIPTION:END -->
