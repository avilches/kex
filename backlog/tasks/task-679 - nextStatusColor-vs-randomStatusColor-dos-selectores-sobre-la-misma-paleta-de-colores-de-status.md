---
id: TASK-679
title: >-
  nextStatusColor vs randomStatusColor - dos selectores sobre la misma paleta de
  colores de status
status: To Do
assignee: []
created_date: '2026-09-04 01:33'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: task
ordinal: 672000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 6, Codigo duplicado, MEDIA. nextStatusColor (WorkspacesSection.tsx:247) vs randomStatusColor (workspaceColor.ts:50, muerto) - Dos selectores sobre la misma paleta; quedarse con el de WorkspacesSection (balancea por uso) movido a workspaceColor.ts.
<!-- SECTION:DESCRIPTION:END -->
