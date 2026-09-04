---
id: TASK-510
title: >-
  useTerminalSession.ts:722-751 - rama blocks de bindLeafToSlot sin
  registerTitleHandler/onRunningCommand
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 510000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. La rama blocks de bindLeafToSlot no registra registerTitleHandler ni onRunningCommand: titulos OSC rotos en tabs blocks y scriptRunning atascado (RunButton en "running" para siempre) si un Script corre en un tab blocks.
<!-- SECTION:DESCRIPTION:END -->
