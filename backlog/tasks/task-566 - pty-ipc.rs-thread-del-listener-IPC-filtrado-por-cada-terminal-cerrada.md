---
id: TASK-566
title: pty/ipc.rs - thread del listener IPC filtrado por cada terminal cerrada
status: To Do
assignee: []
created_date: '2026-09-04 01:24'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: high
type: bug
ordinal: 566000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 4, Memory/resource leaks, ALTA. Detallado en el bug de pty/ipc.rs:22 de la seccion 2. El leak mas claro del backend: crece linealmente con el churn de tabs.
<!-- SECTION:DESCRIPTION:END -->
