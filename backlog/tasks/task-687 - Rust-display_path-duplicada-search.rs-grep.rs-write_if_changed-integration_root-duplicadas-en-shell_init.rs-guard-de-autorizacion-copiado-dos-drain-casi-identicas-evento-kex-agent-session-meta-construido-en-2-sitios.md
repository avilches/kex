---
id: TASK-687
title: >-
  Rust: display_path duplicada (search.rs/grep.rs),
  write_if_changed/integration_root duplicadas en shell_init.rs, guard de
  autorizacion copiado, dos drain() casi identicas, evento
  kex:agent-session-meta construido en 2 sitios
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
ordinal: 680000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 6, Codigo duplicado, BAJA. Rust: display_path identica en search.rs:288 y grep.rs:325; write_if_changed/integration_root duplicadas en los cfg unix/windows de shell_init.rs; guard de autorizacion copiado en resolve_repo_in_authorized y panel_snapshot; dos drain() casi identicas (git/process.rs:385, shell/mod.rs:335); el evento kex:agent-session-meta construido en 2 sitios con payloads ya divergentes (session.rs:240 vs ipc.rs:147).
<!-- SECTION:DESCRIPTION:END -->
