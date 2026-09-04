---
id: TASK-554
title: 'pty/mod.rs:269-285 - pty_metrics hace refresh_processes(All) en cada poll'
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: low
type: bug
ordinal: 554000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 2, Bugs backend Rust, BAJA. Copia de todos los procesos del sistema en cada poll aunque se pidan 1-2 PTYs.
<!-- SECTION:DESCRIPTION:END -->
