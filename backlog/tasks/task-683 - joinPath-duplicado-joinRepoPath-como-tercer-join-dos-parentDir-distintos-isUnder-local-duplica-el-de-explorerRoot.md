---
id: TASK-683
title: >-
  joinPath duplicado + joinRepoPath como tercer join; dos parentDir distintos;
  isUnder local duplica el de explorerRoot
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
ordinal: 676000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 6, Codigo duplicado, BAJA. joinPath duplicado (NewEditorDialog.tsx:24, useFileTree.ts:47) + joinRepoPath como tercer join; dos parentDir distintos (watch.ts:34 backslash-aware, useExplorerFileDrop.ts:13 no); isUnder local en useFileTree.ts:75 duplica el de explorerRoot.
<!-- SECTION:DESCRIPTION:END -->
