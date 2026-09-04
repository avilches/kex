---
id: TASK-514
title: 'useSourceControlPanel.ts:672 - runMutation no comprueba localActionBusy'
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
ordinal: 514000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. runMutation no comprueba localActionBusy; el handler de teclado del panel (espacio/s/d en SourceControlPanel.tsx:587-622) lanza operaciones git concurrentes que compiten por index.lock. Fix: incluir localActionBusy en el guard.
<!-- SECTION:DESCRIPTION:END -->
