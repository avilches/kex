---
id: TASK-530
title: 'GitDiffPane.tsx:105-117 - countDiffLines cuenta dos veces la primera linea'
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: low
type: bug
ordinal: 530000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, BAJA. countDiffLines cuenta dos veces la primera linea y no excluye headers +++/--- en el chequeo final (solo afecta al fallback).
<!-- SECTION:DESCRIPTION:END -->
