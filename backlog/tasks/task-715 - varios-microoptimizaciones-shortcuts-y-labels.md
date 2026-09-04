---
id: TASK-715
title: >-
  matchesShortcut lineal pese a existir SHORTCUTS_BY_ID; shortcutLabels
  recalculado por render; NotificationBell.relativeTime no avanza con popover
  abierto; WorkspaceBar map inline; onSearchHandle des-re-registra en cada
  render
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
ordinal: 708000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 9, Optimizaciones, BAJA. matchesShortcut hace SHORTCUTS.find lineal por keydown pese a existir SHORTCUTS_BY_ID; shortcutLabels (9 getShortcutLabel) recalculado por render en PaneTabBar; NotificationBell.relativeTime no avanza con el popover abierto; WorkspaceBar recibe workspaces.map(...) inline (impide memoizarlo); onSearchHandle inline en TabContent.tsx:441 des/re-registra el handle en cada render.
<!-- SECTION:DESCRIPTION:END -->
