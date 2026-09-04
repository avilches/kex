---
id: TASK-581
title: 'sidebarState.ts:35-37 - parseView solo acepta git, pierde history al reiniciar'
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
ordinal: 508000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. src/modules/workspaces/lib/sidebarState.ts:35-37 - parseView solo acepta "git" pero SidebarView incluye "history" y se persiste: tras reiniciar con History activa, el sidebar restaura Explorer silenciosamente. Fix: aceptar tambien "history".
<!-- SECTION:DESCRIPTION:END -->
