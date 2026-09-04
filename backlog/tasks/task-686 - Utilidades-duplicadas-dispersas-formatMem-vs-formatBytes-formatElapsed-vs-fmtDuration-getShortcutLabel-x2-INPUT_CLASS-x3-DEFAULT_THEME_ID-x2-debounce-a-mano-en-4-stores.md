---
id: TASK-686
title: >-
  Utilidades duplicadas dispersas: formatMem vs formatBytes, formatElapsed vs
  fmtDuration, getShortcutLabel x2, INPUT_CLASS x3, DEFAULT_THEME_ID x2,
  debounce a mano en 4 stores
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
ordinal: 679000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 6, Codigo duplicado, BAJA. formatMem (metricsFormat.ts) vs formatBytes (UpdaterDialog.tsx:36); formatElapsed (TerminalPathBarMenu.tsx:22) vs fmtDuration (BlockOverlay.tsx:51); getShortcutLabel reimplementado en CommandPalette.tsx:533 y SearchInline.tsx:63; INPUT_CLASS copiado en 3 secciones de settings; DEFAULT_THEME_ID definido en 2 sitios (store.ts:62, theme/types.ts:67); debounce de persistencia a mano en 4 stores de workspaces (workspaceBarState, sidebarState, workspaceState, collapsedGroupsState): helper debouncedInvoke.
<!-- SECTION:DESCRIPTION:END -->
