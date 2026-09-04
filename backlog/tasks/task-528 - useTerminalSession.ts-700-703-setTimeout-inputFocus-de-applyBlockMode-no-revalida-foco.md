---
id: TASK-528
title: >-
  useTerminalSession.ts:700-703 - setTimeout inputFocus de applyBlockMode no
  revalida foco
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: low
type: bug
ordinal: 528000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, BAJA. El setTimeout(inputFocus, 0) de applyBlockMode no revalida visibleNow/focusedNow al disparar (leccion del GOTCHAS Bug 7): puede robar el foco al tab nuevo.
<!-- SECTION:DESCRIPTION:END -->
