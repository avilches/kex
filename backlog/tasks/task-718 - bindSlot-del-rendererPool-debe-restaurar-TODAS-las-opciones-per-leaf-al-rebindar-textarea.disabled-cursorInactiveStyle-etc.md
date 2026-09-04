---
id: TASK-718
title: >-
  bindSlot del rendererPool debe restaurar TODAS las opciones per-leaf al
  rebindar (textarea.disabled, cursorInactiveStyle, etc)
status: To Do
assignee: []
created_date: '2026-09-04 01:34'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: task
ordinal: 711000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 10, Mejoras estructurales propuestas, item 3. bindSlot del rendererPool debe restaurar TODAS las opciones per-leaf (textarea.disabled, cursorInactiveStyle, etc) al rebindar: es la causa raiz del bug ALTA del terminal y de la incoherencia de contaminacion entre leaves.
<!-- SECTION:DESCRIPTION:END -->
