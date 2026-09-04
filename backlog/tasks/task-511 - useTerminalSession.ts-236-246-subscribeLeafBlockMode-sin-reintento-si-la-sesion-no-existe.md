---
id: TASK-511
title: >-
  useTerminalSession.ts:236-246 - subscribeLeafBlockMode sin reintento si la
  sesion no existe
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
ordinal: 511000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. subscribeLeafBlockMode devuelve un no-op si la sesion no existe aun, sin reintento: exactamente el patron que causo el Bug 7 de WORKSPACES_GOTCHAS (se migro subscribeLeafScratchpad a un Map a nivel de modulo, este no).
<!-- SECTION:DESCRIPTION:END -->
