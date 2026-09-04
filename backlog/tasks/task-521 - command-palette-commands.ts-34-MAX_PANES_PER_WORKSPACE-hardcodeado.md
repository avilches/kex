---
id: TASK-521
title: 'command-palette/commands.ts:34 - MAX_PANES_PER_WORKSPACE hardcodeado'
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
ordinal: 521000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. MAX_PANES_PER_WORKSPACE = 4 hardcodeado; el resto del codigo usa la preferencia workspacePaneLimit (default 8). La paleta deshabilita el split a partir de 4 cuando el limite real es 8. Fix: leer la preferencia.
<!-- SECTION:DESCRIPTION:END -->
