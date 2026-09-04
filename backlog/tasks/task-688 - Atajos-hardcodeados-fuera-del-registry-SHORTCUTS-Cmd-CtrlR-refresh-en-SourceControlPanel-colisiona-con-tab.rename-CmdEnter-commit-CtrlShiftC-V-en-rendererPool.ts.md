---
id: TASK-688
title: >-
  Atajos hardcodeados fuera del registry SHORTCUTS: Cmd/Ctrl+R refresh en
  SourceControlPanel (colisiona con tab.rename), Cmd+Enter commit,
  Ctrl+Shift+C/V en rendererPool.ts
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
ordinal: 681000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 7, Incoherencias, MEDIA. Atajos hardcodeados fuera del registry SHORTCUTS (regla explicita del proyecto): SourceControlPanel.tsx:539 (Cmd/Ctrl+R para refresh, que ademas colisiona con el default de tab.rename y probablemente nunca se ejecuta) y :347 (Cmd+Enter para commit, no reasignable); rendererPool.ts:1001-1021 (Ctrl+Shift+C/V en no-macOS). Registrar scm.refresh y decidir sobre los intrinsecos.
<!-- SECTION:DESCRIPTION:END -->
