---
id: TASK-543
title: >-
  pty/ipc.rs:22 - IpcGuard::drop no despierta accept(), thread filtrado por cada
  tab cerrada
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: high
type: bug
ordinal: 543000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 2, Bugs backend Rust, ALTA. IpcGuard::drop borra el fichero del socket y el comentario afirma que el listener sale "en el siguiente accept error", pero hacer unlink de un socket Unix NO desbloquea accept(): el thread queda bloqueado para siempre en listener.incoming(). Resultado: un thread + fd + clon de AppHandle filtrados por cada tab de terminal cerrada, durante toda la vida del proceso. Fix: set_nonblocking + poll de flag, o conectarse al propio socket antes del unlink para despertar el accept.
<!-- SECTION:DESCRIPTION:END -->
