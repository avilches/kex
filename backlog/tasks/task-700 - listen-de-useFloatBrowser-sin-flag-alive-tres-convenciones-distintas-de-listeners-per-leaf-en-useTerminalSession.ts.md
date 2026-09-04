---
id: TASK-700
title: >-
  listen() de useFloatBrowser sin flag alive; tres convenciones distintas de
  listeners per-leaf en useTerminalSession.ts
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
ordinal: 693000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 7, Incoherencias, BAJA. listen() de useFloatBrowser.ts:23-57 sin flag alive: si se desmonta antes de resolver la promesa, el listener queda vivo. Y tres convenciones de listeners per-leaf en useTerminalSession.ts (dos Maps a nivel de modulo + uno dentro de Session, ver bug de subscribeLeafBlockMode).
<!-- SECTION:DESCRIPTION:END -->
