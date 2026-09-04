---
id: TASK-506
title: >-
  closeQueue.ts + App.tsx - locked no se respeta para tabs
  browser/markdown/git-*
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
ordinal: 506000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. src/app/hooks/closeQueue.ts:46-72 + src/app/App.tsx:2011-2017 - el invariante "locked aplica a todos los kinds" (documentado en types.ts) solo se respeta para terminal/editor: runCloseQueue y el click de boton central (onAuxClick en PaneTabBar.tsx:222) cierran tabs browser/markdown/git-* bloqueados. Fix: comprobar tab.locked genericamente.
<!-- SECTION:DESCRIPTION:END -->
