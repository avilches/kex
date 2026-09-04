---
id: TASK-690
title: >-
  Contaminacion de opciones a nivel de slot entre leaves (cursorInactiveStyle,
  textarea disabled): bindSlot no restaura el set completo de opciones per-leaf
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
ordinal: 683000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 7, Incoherencias, MEDIA. Contaminacion de opciones a nivel de slot entre leaves: BlockDecorations fija cursorInactiveStyle = "none" y applyBlockMode deshabilita la textarea; nada se restablece en bindSlot y el guard skip-if-equal impide que la preferencia lo corrija (mismo origen que el bug ALTA del terminal en la seccion de bugs frontend). El fix natural: bindSlot restaura el set completo de opciones per-leaf.
<!-- SECTION:DESCRIPTION:END -->
