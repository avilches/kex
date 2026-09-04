---
id: TASK-709
title: >-
  PaneTabBar.tsx:131,138 - todos los tabs se suscriben a los snapshots completos
  de runningCommands y oscTitles, sin selector por tabId
status: To Do
assignee: []
created_date: '2026-09-04 01:34'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: low
type: task
ordinal: 702000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 9, Optimizaciones, BAJA. PaneTabBar.tsx:131,138 - Todos los tabs (tambien editores/browsers) se suscriben a los snapshots completos de runningCommands y oscTitles: cualquier comando en cualquier terminal re-renderiza todos los DraggableTab. Selector por tabId.
<!-- SECTION:DESCRIPTION:END -->
