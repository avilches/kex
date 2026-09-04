---
id: TASK-675
title: >-
  EditorPane.tsx y GitDiffPane.tsx - efectos de reconfiguracion de compartments
  CodeMirror copiados literales
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
ordinal: 668000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 6, Codigo duplicado, MEDIA. src/modules/editor/EditorPane.tsx:191-267 y GitDiffPane.tsx:254-269 - Los efectos de reconfiguracion de compartments CodeMirror copiados literales (13 + 4). Un useCompartmentReconfigure eliminaria ~80 lineas.
<!-- SECTION:DESCRIPTION:END -->
