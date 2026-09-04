---
id: TASK-564
title: 'shell/background.rs:64-66 - BackgroundProc::kill mata solo el hijo inmediato'
status: To Do
assignee: []
created_date: '2026-09-04 01:24'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 564000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 4, Memory/resource leaks, MEDIA. En Unix los descendientes (p. ej. node bajo npm run dev) quedan huerfanos; no hay setsid + kill de process group ni Job Object para procesos bg en Windows.
<!-- SECTION:DESCRIPTION:END -->
