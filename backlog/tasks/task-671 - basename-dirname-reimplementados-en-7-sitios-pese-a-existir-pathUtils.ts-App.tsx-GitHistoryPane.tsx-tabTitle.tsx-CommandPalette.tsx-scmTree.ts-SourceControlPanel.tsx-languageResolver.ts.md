---
id: TASK-671
title: >-
  basename/dirname reimplementados en 7 sitios pese a existir pathUtils.ts
  (App.tsx, GitHistoryPane.tsx, tabTitle.tsx, CommandPalette.tsx, scmTree.ts,
  SourceControlPanel.tsx, languageResolver.ts)
status: To Do
assignee: []
created_date: '2026-09-04 01:33'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: high
type: task
ordinal: 664000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 6, Codigo duplicado, ALTA. basename/dirname caseros reimplementados en 7 sitios pese a existir src/lib/pathUtils.ts (pathBasename/pathDirname, con tests): App.tsx:148, GitHistoryPane.tsx:87,92, tabTitle.tsx:14, CommandPalette.tsx:528, scmTree.ts:26, SourceControlPanel.tsx:142,147 (este fichero ademas YA importa pathBasename en la linea 28 y aun asi define los suyos) y languageResolver.ts:17. Las implementaciones divergen (con/sin tolerancia a trailing slash). Consolidar en pathUtils.
<!-- SECTION:DESCRIPTION:END -->
