---
id: TASK-548
title: >-
  shell/mod.rs:70-75,220-224 - shell_run_command/shell_session_run ocupan un
  worker tokio hasta 300s
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 548000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 2, Bugs backend Rust, MEDIA. shell_run_command/shell_session_run son async pero bloquean con rx.recv() hasta 300s, ocupando un worker tokio por comando. Fix: spawn_blocking como en git.
<!-- SECTION:DESCRIPTION:END -->
