---
id: TASK-708
title: >-
  useEditorFileSync.ts - cada escritura externa a un fichero abierto se lee dos
  veces (evento fs:file-written + watcher del directorio padre)
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
ordinal: 701000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 9, Optimizaciones, MEDIA. src/modules/editor/useEditorFileSync.ts - Cada escritura externa a un fichero abierto se lee dos veces (evento fs:file-written + watcher del directorio padre convergen en reload()). Coalescing por path.
<!-- SECTION:DESCRIPTION:END -->
