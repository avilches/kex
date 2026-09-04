---
id: TASK-567
title: 'shell/mod.rs:153-158 - entradas de ShellState.bg de procesos terminados sin GC'
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
ordinal: 567000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 4, Memory/resource leaks, BAJA. Con ring buffer de 4 MB cada una, permanecen hasta que el frontend llame a shell_bg_kill.
<!-- SECTION:DESCRIPTION:END -->
