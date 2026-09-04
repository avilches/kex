---
id: TASK-672
title: >-
  shellQuote.ts vs quoteShellPath.ts - dos utilidades de quoting con escapado
  Windows incompatible
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
ordinal: 665000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 6, Codigo duplicado, MEDIA. src/lib/shellQuote.ts vs src/modules/terminal/lib/quoteShellPath.ts - Dos utilidades de quoting con escapado Windows incompatible (\" vs ""); una de las dos politicas es incorrecta para algun caso. Unificar o documentar la diferencia.
<!-- SECTION:DESCRIPTION:END -->
