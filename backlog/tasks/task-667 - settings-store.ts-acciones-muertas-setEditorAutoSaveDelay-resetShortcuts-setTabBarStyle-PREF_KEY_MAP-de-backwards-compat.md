---
id: TASK-667
title: >-
  settings/store.ts - acciones muertas: setEditorAutoSaveDelay, resetShortcuts,
  setTabBarStyle, PREF_KEY_MAP de backwards-compat
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
ordinal: 660000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 5, Codigo muerto, Maquinaria muerta dentro de modulos vivos, MEDIA. src/modules/settings/store.ts - Acciones muertas: setEditorAutoSaveDelay, resetShortcuts, setTabBarStyle (+ tipo TabBarStyle). PREF_KEY_MAP existe solo por "backwards-compat used by tests", contra la regla del proyecto de no mantener compat.
<!-- SECTION:DESCRIPTION:END -->
