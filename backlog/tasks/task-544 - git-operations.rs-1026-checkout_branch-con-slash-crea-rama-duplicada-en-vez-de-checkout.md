---
id: TASK-544
title: >-
  git/operations.rs:1026 - checkout_branch con slash crea rama duplicada en vez
  de checkout
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
ordinal: 544000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 2, Bugs backend Rust, ALTA. checkout_branch decide si una rama es remota con branch.find('/'): una rama local feature/login ejecuta git checkout -b login --track feature/login, creando una rama duplicada en vez de hacer checkout. El frontend ya conoce branch.isRemote (useSourceControlPanel.ts:473) pero no lo pasa. Fix: parametro is_remote o comprobar git show-ref refs/heads/<branch>.
<!-- SECTION:DESCRIPTION:END -->
