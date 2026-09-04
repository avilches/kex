---
id: TASK-547
title: >-
  agent/session_store.rs:309 - read-modify-write de agent-sessions.json sin
  sincronizacion
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
ordinal: 547000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 2, Bugs backend Rust, MEDIA. record_session/detach_session/remove_panel_from_store hacen read-modify-write de agent-sessions.json sin sincronizacion, invocados concurrentemente desde threads de PTY y de socket: lost updates. Fix: Mutex global alrededor del ciclo.
<!-- SECTION:DESCRIPTION:END -->
