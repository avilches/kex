---
id: TASK-549
title: 'pty/ipc.rs:110-119 - accept-loop con read_line bloqueante sin timeout'
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
ordinal: 549000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 2, Bugs backend Rust, MEDIA. El accept-loop lee cada conexion con read_line bloqueante sin timeout: un cliente que conecta y no envia nada bloquea todos los hooks posteriores de ese PTY. Fix: set_read_timeout.
<!-- SECTION:DESCRIPTION:END -->
