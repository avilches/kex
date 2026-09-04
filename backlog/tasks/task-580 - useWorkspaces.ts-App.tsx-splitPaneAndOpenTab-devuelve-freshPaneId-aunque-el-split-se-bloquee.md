---
id: TASK-580
title: >-
  useWorkspaces.ts + App.tsx - splitPaneAndOpenTab devuelve freshPaneId aunque
  el split se bloquee
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
ordinal: 507000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. src/modules/workspaces/lib/useWorkspaces.ts:478-499 + src/app/App.tsx:1095-1131 - splitPaneAndOpenTab devuelve freshPaneId aunque el split se bloquee por workspacePaneLimit. En el limite de panes, abrir un fichero desde un link del terminal falla en silencio y deja una entrada huerfana en pendingGotoLine. Fix: devolver null en fallo y que el caller muestre el toast de limite.
<!-- SECTION:DESCRIPTION:END -->
