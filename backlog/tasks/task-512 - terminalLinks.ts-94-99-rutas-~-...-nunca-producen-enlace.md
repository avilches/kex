---
id: TASK-512
title: 'terminalLinks.ts:94-99 - rutas ~/... nunca producen enlace'
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
ordinal: 512000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. Las rutas ~/... se pasan literales a fs_stat y Rust no expande ~ (workspace.rs:412): el patron home-relative de PATH_PATTERNS nunca produce un enlace. Feature silenciosamente rota. Fix: expandir ~ en el frontend.
<!-- SECTION:DESCRIPTION:END -->
