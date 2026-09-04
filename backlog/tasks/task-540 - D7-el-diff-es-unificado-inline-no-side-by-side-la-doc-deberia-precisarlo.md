---
id: TASK-540
title: 'D7: el diff es unificado inline, no side-by-side; la doc deberia precisarlo'
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels: []
dependencies: []
references:
  - docs/pending/DOCS.md
priority: low
type: docs
ordinal: 540000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Documento: docs/ARCHITECTURE.md lineas 123, 195, 261.
Afirma: describe el diff genericamente como the CodeMirror merge extension y diff decorations. No afirma side-by-side, asi que tecnicamente no hay mentira en la doc. Pero el codigo usa unifiedMergeView (inline, una columna), no MergeView side-by-side.
Realidad: src/modules/editor/GitDiffPane.tsx usa unifiedMergeView.
Accion: precisar en la doc unified (inline) merge view. Nota importante: el doble panel side-by-side es un objetivo de producto del usuario que hoy no esta implementado (ver la tarea F1, diff en doble panel, migrada aparte a Backlog.md).
<!-- SECTION:DESCRIPTION:END -->
