---
id: TASK-573
title: >-
  App.tsx:320,1199,1938 - pendingGotoLine acumula entradas de tabs que nunca
  llegan a montarse
status: To Do
assignee: []
created_date: '2026-09-04 01:24'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: low
type: bug
ordinal: 573000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 4, Memory/resource leaks, BAJA. Podar en el efecto de limpieza de tabs vivos (App.tsx:514-543), que ya limpia el resto de mapas.
<!-- SECTION:DESCRIPTION:END -->
