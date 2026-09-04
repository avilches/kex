---
id: TASK-546
title: >-
  pty/mod.rs:157 - pty_write sincrono puede bloquear el main thread
  indefinidamente
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
ordinal: 546000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 2, Bugs backend Rust, MEDIA. pty_write sincrono hace write_all con el mutex del writer: si el buffer del PTY esta lleno (proceso parado con flow control), bloquea el main thread y toda la app indefinidamente.
<!-- SECTION:DESCRIPTION:END -->
