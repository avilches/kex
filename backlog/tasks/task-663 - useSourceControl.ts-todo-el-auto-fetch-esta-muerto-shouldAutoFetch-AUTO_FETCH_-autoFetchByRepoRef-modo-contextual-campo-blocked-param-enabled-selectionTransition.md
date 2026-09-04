---
id: TASK-663
title: >-
  useSourceControl.ts - todo el auto-fetch esta muerto (shouldAutoFetch,
  AUTO_FETCH_*, autoFetchByRepoRef, modo contextual, campo blocked, param
  enabled, selectionTransition)
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
ordinal: 656000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 5, Codigo muerto, Maquinaria muerta dentro de modulos vivos, MEDIA. src/modules/source-control/useSourceControl.ts - Todo el auto-fetch esta muerto: ningun caller pasa remote: "auto"/"always" (los 7 call sites usan "never"), con lo que caen shouldAutoFetch, el bloque de fetch de doRefresh, AUTO_FETCH_*, autoFetchByRepoRef y la logica de upgrade de inflightModeRef. Nota: ese codigo muerto contiene ademas un bug latente (el path de error del fetch aplica estado obsoleto sin comprobar requestId). Tambien muertos: getSourceControlRemoteIndicator, el modo "contextual" de runRemoteAction con getContextualAction y el campo blocked, el parametro enabled (unico caller pasa true), y selectionTransition en useSourceControlPanel.ts.
<!-- SECTION:DESCRIPTION:END -->
