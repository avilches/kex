---
id: TASK-518
title: 'GitHistoryPane.tsx:418-423 - sin refresco fuera del estado de error'
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
ordinal: 518000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. No hay ningun refresco fuera del estado de error: ni boton, ni fs-changed, ni refresh on focus. Como los tabs no se desmontan, un tab de historia muestra para siempre el log del momento en que se abrio, aunque se commitee al lado.
<!-- SECTION:DESCRIPTION:END -->
