---
id: TASK-704
title: >-
  App.tsx:1773-1930 - tabCallbacks depende de activeWorkspace/activeTabId y
  anula el memo de todos los PaneView en cada cd
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
ordinal: 697000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 9, Optimizaciones, MEDIA. App.tsx:1773-1930 - tabCallbacks depende de activeWorkspace y activeTabId: su identidad cambia con cada mutacion de workspaces (incluido cada OSC 7 de cwd de cualquier terminal) y anula el memo de todos los PaneView, re-renderizando el arbol completo de panes/tabs en cada cd. Los onXxxStable de al lado ya resuelven esto con refs; aplicar el mismo patron.
<!-- SECTION:DESCRIPTION:END -->
