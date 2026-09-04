---
id: TASK-565
title: 'WorkspaceBar.tsx:653-669 - resizer no maneja pointercancel'
status: To Do
assignee: []
created_date: '2026-09-04 01:24'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 565000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 4, Memory/resource leaks, MEDIA. El resizer anade pointermove/pointerup a document pero no maneja pointercancel: si el gesto se cancela, los listeners quedan vivos y el raton sigue redimensionando.
<!-- SECTION:DESCRIPTION:END -->
