---
id: TASK-668
title: >-
  Exports sin consumidor verificados uno a uno (~20 simbolos:
  readOnlyCompartment, ALL_LANGUAGES, preloadLanguages, clearTheme,
  useLockFlash, useOscTitle, y otros)
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
ordinal: 661000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 5, Codigo muerto, Maquinaria muerta dentro de modulos vivos, BAJA. Exports sin consumidor (verificados uno a uno): readOnlyCompartment (editor/lib/extensions.ts:21), ALL_LANGUAGES/EXPOSED_LANGUAGES (languageDefinitions.ts:452), preloadLanguages (languageResolver.ts:89), languageRef nunca leido (EditorPane.tsx:130), gitDecorationsRef constante disfrazada (useFileTree.ts:109), clearTheme (applyTheme.ts:80), useLockFlash (lockFlashStore.ts:30), useOscTitle (oscTitleStore.ts:53), randomStatusColor (workspaceColor.ts:50), loadAllIcons + allIconsCache inalcanzable (workspaceIcon.ts:212-247), prop onRenameFile declarada y pasada pero nunca usada (PaneTabBar.tsx:53), iconUrl en PaletteItem (command-palette/types.ts:12), EDITOR_GROUPS (external-editors/catalog.ts:49), ShortcutKeys (Kbd.tsx:28), CTRL_KEY/ALT_KEY/TAB_KEY (platform.ts:23-26), LANE_WIDTH/RAIL_PADDING_X/LANE_COLORS/laneColor (git-history), NO_STATUS_GROUP_ID (workspaceOrder.ts:11), getBlocks/read()/commandLines() (blockDecorations.ts), PromptTracker.getMarker (osc-handlers.ts:75). Knip lista ademas ~33 tipos exportados sin uso, limpiables en bloque.
<!-- SECTION:DESCRIPTION:END -->
