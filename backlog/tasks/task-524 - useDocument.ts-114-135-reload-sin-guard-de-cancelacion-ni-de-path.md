---
id: TASK-524
title: 'useDocument.ts:114-135 - reload() sin guard de cancelacion ni de path'
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
ordinal: 524000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. Un reload en vuelo del path viejo (tras rename) pisa el documento del path nuevo, o lo deja en status: "error". Fix: participar del mecanismo cancelled del efecto de carga.
<!-- SECTION:DESCRIPTION:END -->
